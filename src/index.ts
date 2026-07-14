import * as path from 'path';
import { getSiteConfig } from './config';
import { JsfPrimefacesScraper } from './scraper';
import { PjScraper } from './pj-scraper';
import { Logger, LogLevel } from './logger';
import * as storage from './storage';
import * as retry from './retry';
import { runInteractiveMenu, CliOptions } from './cli';
import { DocumentRecord, SiteConfig } from './types';

function getOptionsFromEnv(siteName: string): CliOptions {
  const filters: Record<string, string> = {};
  if (process.env.SCRAPER_TEXT) filters.texto = process.env.SCRAPER_TEXT;
  if (process.env.SCRAPER_NUMERO_EXPEDIENTE) filters.numeroExpediente = process.env.SCRAPER_NUMERO_EXPEDIENTE;
  if (process.env.SCRAPER_ADMINISTRADO) filters.administrado = process.env.SCRAPER_ADMINISTRADO;
  if (process.env.SCRAPER_UNIDAD_FISCALIZABLE) filters.unidadFiscalizable = process.env.SCRAPER_UNIDAD_FISCALIZABLE;
  if (process.env.SCRAPER_SECTOR) filters.sector = process.env.SCRAPER_SECTOR;
  if (process.env.SCRAPER_NUMERO_RESOLUCION) filters.numeroResolucion = process.env.SCRAPER_NUMERO_RESOLUCION;

  return {
    site: siteName,
    metadataOnly: process.env.SCRAPER_METADATA_ONLY === 'true',
    maxDownloads: parseInt(process.env.SCRAPER_MAX_DOWNLOADS || '0', 10) || 0,
    retryFailed: process.env.SCRAPER_RETRY_FAILED === 'true',
    filters,
  };
}

function isPj(config: SiteConfig): boolean {
  return config.baseUrl.includes('jurisprudencia.pj.gob.pe');
}

async function runScraper(options: CliOptions) {
  const config = getSiteConfig(options.site);
  const rootDir = path.resolve(__dirname, '..');
  const { dataDir, pdfDir, logDir } = storage.createOutputDirs(rootDir);
  const logFile = path.join(logDir, `scraper_${options.site}_${Date.now()}.log`);
  const logger = new Logger(LogLevel.INFO, logFile);

  logger.info('============================================');
  logger.info(`Scraper JSF - Sitio: ${config.name}`);
  logger.info(`URL: ${config.baseUrl}${config.path}`);
  logger.info(`Modo: ${options.metadataOnly ? 'solo metadatos' : 'metadatos + PDFs'}`);
  logger.info(`Filtros: ${Object.keys(options.filters).length ? JSON.stringify(options.filters) : 'ninguno'}`);
  logger.info(`Max downloads: ${options.maxDownloads || 'sin límite'}`);
  logger.info('============================================');

  let records: DocumentRecord[];
  const progressFile = path.join(dataDir, 'progress.json');
  const existing = storage.loadProgress(progressFile);

  if (isPj(config)) {
    // Flujo específico del Poder Judicial (RichFaces)
    const scraper = new PjScraper(config, logger, dataDir, pdfDir);
    await retry.withRetry(() => scraper.init(), logger, { maxAttempts: 3 });

    if (existing && !options.retryFailed) {
      records = existing;
      logger.info(`Continuando desde progreso previo: ${records.length} registros.`);
    } else {
      const maxPages = parseInt(process.env.SCRAPER_MAX_PAGES || '0', 10) || 0;
      records = await retry.withRetry(
        () => scraper.fetchMetadata(options.filters.texto ?? '', maxPages),
        logger,
        { maxAttempts: 3 }
      );
      storage.saveJson(records, progressFile);
      storage.saveCsv(records, path.join(dataDir, 'metadata.csv'));
      logger.info('Metadatos guardados en data/metadata.csv y data/progress.json');
    }

    if (options.metadataOnly) {
      logger.info('Modo solo metadatos. Finalizando.');
      return;
    }

    await scraper.downloadAllPdfs(records, options.maxDownloads, options.retryFailed);
    storage.saveJson(records, progressFile);
    storage.saveCsv(records, path.join(dataDir, 'metadata.csv'));
    return;
  }

  // Flujo OEFA (PrimeFaces)
  const scraper = new JsfPrimefacesScraper(config, logger, dataDir, pdfDir);
  await retry.withRetry(() => scraper.init(), logger, { maxAttempts: 3 });

  if (existing && !options.retryFailed) {
    records = existing;
    logger.info(`Continuando desde progreso previo: ${records.length} registros.`);
  } else {
    records = await retry.withRetry(
      () => scraper.fetchMetadata(options.filters),
      logger,
      { maxAttempts: 3 }
    );
    storage.saveJson(records, progressFile);
    storage.saveCsv(records, path.join(dataDir, 'metadata.csv'));
    logger.info('Metadatos guardados en data/metadata.csv y data/progress.json');
  }

  if (options.metadataOnly) {
    logger.info('Modo solo metadatos. Finalizando.');
    return;
  }

  let toProcess = records.filter(
    (r) => r.status !== 'downloaded' && (!options.retryFailed ? r.status !== 'failed' : true)
  );

  if (options.maxDownloads > 0) {
    toProcess = toProcess.slice(0, options.maxDownloads);
  }

  logger.info(`Documentos a procesar: ${toProcess.length}`);

  let processed = 0;
  let downloaded = 0;
  let failed = 0;

  for (const record of toProcess) {
    processed++;
    record.lastAttempt = new Date().toISOString();

    try {
      if (!record.uuid) {
        logger.info(`[${processed}/${toProcess.length}] Extrayendo UUID para ${record.numeroResolucion}...`);
        await retry.withRetry(() => scraper.fetchUuid(record), logger);
        storage.saveJson(records, progressFile);
      }

      logger.info(`[${processed}/${toProcess.length}] Descargando PDF para ${record.numeroResolucion}...`);
      await retry.withRetry(() => scraper.downloadDocument(record), logger);
      downloaded++;
    } catch (err: any) {
      failed++;
      record.status = 'failed';
      record.error = err.message;
      logger.error(`[${processed}/${toProcess.length}] Error con ${record.numeroResolucion}: ${err.message}`);
    }

    storage.saveJson(records, progressFile);
    storage.saveCsv(records, path.join(dataDir, 'metadata.csv'));

    if (processed < toProcess.length) {
      await retry.politeDelay(config.requestDelayMs, config.randomDelayMs);
    }
  }

  logger.info('============================================');
  logger.info('Resumen de ejecución');
  logger.info(`Total de metadatos: ${records.length}`);
  logger.info(`Procesados: ${processed}`);
  logger.info(`Descargados: ${downloaded}`);
  logger.info(`Fallados: ${failed}`);
  logger.info(`Pendientes: ${records.length - records.filter((r) => r.status === 'downloaded').length}`);
  logger.info('============================================');
}

async function main() {
  const siteName = process.env.SCRAPER_SITE || 'oefa';
  const interactive = process.env.SCRAPER_INTERACTIVE === 'true' || process.argv.includes('--interactive');

  let options: CliOptions;
  if (interactive) {
    const config = getSiteConfig(siteName);
    options = await runInteractiveMenu(config);
  } else {
    options = getOptionsFromEnv(siteName);
  }

  await runScraper(options);
}

main().catch((err) => {
  console.error('Error fatal:', err);
  process.exit(1);
});
