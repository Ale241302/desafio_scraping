import * as path from 'path';
import { getSiteConfig } from './config';
import { JsfPrimefacesScraper } from './scraper';
import { Logger, LogLevel } from './logger';
import * as storage from './storage';
import * as retry from './retry';
import { DocumentRecord } from './types';

async function main() {
  const siteName = process.env.SCRAPER_SITE || 'oefa';
  const metadataOnly = process.env.SCRAPER_METADATA_ONLY === 'true';
  const maxDownloads = parseInt(process.env.SCRAPER_MAX_DOWNLOADS || '0', 10) || 0;
  const retryFailed = process.env.SCRAPER_RETRY_FAILED === 'true';

  const config = getSiteConfig(siteName);
  const rootDir = path.resolve(__dirname, '..');
  const { dataDir, pdfDir, logDir } = storage.createOutputDirs(rootDir);
  const logFile = path.join(logDir, `scraper_${siteName}_${Date.now()}.log`);
  const logger = new Logger(LogLevel.INFO, logFile);

  logger.info('============================================');
  logger.info(`Scraper JSF/PrimeFaces - Sitio: ${config.name}`);
  logger.info(`URL: ${config.baseUrl}${config.path}`);
  logger.info(`Modo: ${metadataOnly ? 'solo metadatos' : 'metadatos + PDFs'}`);
  logger.info(`Max downloads: ${maxDownloads || 'sin límite'}`);
  logger.info('============================================');

  const scraper = new JsfPrimefacesScraper(config, logger, dataDir, pdfDir);

  await retry.withRetry(() => scraper.init(), logger, { maxAttempts: 3 });

  let records: DocumentRecord[];
  const progressFile = path.join(dataDir, 'progress.json');
  const existing = storage.loadProgress(progressFile);

  if (existing && !retryFailed) {
    records = existing;
    logger.info(`Continuando desde progreso previo: ${records.length} registros.`);
  } else {
    records = await retry.withRetry(() => scraper.fetchMetadata(), logger, { maxAttempts: 3 });
    storage.saveJson(records, progressFile);
    storage.saveCsv(records, path.join(dataDir, 'metadata.csv'));
    logger.info('Metadatos guardados en data/metadata.csv y data/progress.json');
  }

  if (metadataOnly) {
    logger.info('Modo solo metadatos. Finalizando.');
    return;
  }

  // Filtrar documentos pendientes o fallidos
  let toProcess = records.filter(
    (r) => r.status !== 'downloaded' && (!retryFailed ? r.status !== 'failed' : true)
  );

  if (maxDownloads > 0) {
    toProcess = toProcess.slice(0, maxDownloads);
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

main().catch((err) => {
  console.error('Error fatal:', err);
  process.exit(1);
});
