import { input, select, confirm, number } from '@inquirer/prompts';
import { SiteConfig } from './types';

export interface CliOptions {
  site: string;
  metadataOnly: boolean;
  maxDownloads: number;
  retryFailed: boolean;
  filters: Record<string, string>;
}

/**
 * Presenta un menú interactivo en la consola para configurar la ejecución.
 */
export async function runInteractiveMenu(config: SiteConfig): Promise<CliOptions> {
  console.log('\n=== Configuración del scraper ===\n');

  const site = await select({
    message: 'Sitio a scrapear:',
    choices: [
      { value: 'oefa', name: 'OEFA - Tribunal de Fiscalización Ambiental' },
      { value: 'pj', name: 'Poder Judicial del Perú - Jurisprudencia' },
    ],
    default: config.name.toLowerCase().includes('oefa') ? 'oefa' : 'pj',
  });

  const metadataOnly = await confirm({
    message: '¿Solo extraer metadatos (sin descargar PDFs)?',
    default: false,
  });

  const filters: Record<string, string> = {};

  if (site === 'pj') {
    // En PJ el único filtro disponible es el texto de búsqueda, y es obligatorio.
    const texto = await input({
      message: 'Texto a buscar en el contenido de las resoluciones (obligatorio):',
      default: '',
      validate: (value) => value?.trim() ? true : 'Debes ingresar un texto de búsqueda.',
    });
    filters.texto = texto.trim();
  } else {
    // OEFA permite filtros adicionales opcionales.
    const useFilters = await confirm({
      message: '¿Deseas aplicar filtros adicionales de búsqueda?',
      default: false,
    });

    if (useFilters) {
      const numeroExpediente = await input({
        message: 'Número de expediente (dejar vacío para todos):',
        default: '',
      });
      if (numeroExpediente.trim()) filters.numeroExpediente = numeroExpediente.trim();

      const administrado = await input({
        message: 'Administrado (dejar vacío para todos):',
        default: '',
      });
      if (administrado.trim()) filters.administrado = administrado.trim();

      const unidadFiscalizable = await input({
        message: 'Unidad fiscalizable (dejar vacío para todas):',
        default: '',
      });
      if (unidadFiscalizable.trim()) filters.unidadFiscalizable = unidadFiscalizable.trim();

      if (config.sectorOptions && config.sectorOptions.length > 0) {
        const sector = await select({
          message: 'Sector:',
          choices: config.sectorOptions.map((opt) => ({
            value: opt.value,
            name: opt.label,
          })),
        });
        if (sector) filters.sector = sector;
      }

      const numeroResolucion = await input({
        message: 'Nro. Resolución de Apelación (dejar vacío para todos):',
        default: '',
      });
      if (numeroResolucion.trim()) filters.numeroResolucion = numeroResolucion.trim();
    }
  }

  let maxDownloads = 0;
  if (!metadataOnly) {
    const limit = await confirm({
      message: '¿Limitar la cantidad de PDFs a descargar?',
      default: false,
    });

    if (limit) {
      maxDownloads = await number({
        message: 'Máximo de PDFs a descargar:',
        default: 5,
        validate: (value) => (value && value > 0 ? true : 'Debe ser mayor a 0'),
      }) ?? 0;
    }
  }

  const retryFailed = await confirm({
    message: '¿Reintentar documentos previamente fallidos?',
    default: false,
  });

  return {
    site,
    metadataOnly,
    maxDownloads,
    retryFailed,
    filters,
  };
}
