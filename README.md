# Desafío de Scraping — Scraper JSF/PrimeFaces

Scraper en **TypeScript** que extrae metadatos y descarga PDFs de sitios web basados en **JSF / PrimeFaces** usando únicamente peticiones HTTP (sin Puppeteer, Playwright ni Selenium).

## 🌐 Sitios soportados

| Sitio | Configuración | Notas |
|-------|---------------|-------|
| `oefa` | OEFA — Tribunal de Fiscalización Ambiental | ✅ Probado y funcionando desde cualquier ubicación. |
| `pj` | Poder Judicial del Perú — Jurisprudencia | ⚠️ Configuración tentativa. Requiere VPN a Perú para probar/ajustar IDs reales. |

> El sitio principal (`pj`) no fue accesible desde el entorno de desarrollo actual (sin VPN a Perú). El código está diseñado para ser fácilmente adaptable una vez que se pueda inspeccionar el sitio.

## 📦 Requisitos

- Node.js 18+
- npm

## 🚀 Instalación

```bash
npm install
```

## ▶️ Uso

### Variables de entorno

| Variable | Valor por defecto | Descripción |
|----------|-------------------|-------------|
| `SCRAPER_SITE` | `oefa` | Sitio a scrapear (`oefa` o `pj`). |
| `SCRAPER_METADATA_ONLY` | `false` | Si es `true`, solo descarga metadatos (Excel/CSV/JSON). |
| `SCRAPER_MAX_DOWNLOADS` | `0` | Máximo de PDFs a descargar en la ejecución (`0` = ilimitado). |
| `SCRAPER_RETRY_FAILED` | `false` | Si es `true`, reintenta los documentos marcados como fallidos. |

### Scripts disponibles

```bash
# Solo metadatos (Excel → CSV/JSON)
npm run metadata

# Descargar todos los PDFs (puede tardar horas)
npm start
# o
npm run start:oefa

# Descargar solo 5 PDFs de prueba
npx cross-env SCRAPER_SITE=oefa SCRAPER_MAX_DOWNLOADS=5 npx tsx src/index.ts

# Reintentar documentos fallidos
npm run retry
```

## 📁 Estructura de salida

```
.
├── data/
│   ├── metadata.csv      # Metadatos en CSV
│   └── progress.json     # Progreso con estado de cada documento
├── pdfs/                 # PDFs descargados
│   └── <RESOLUCION>_<EXPEDIENTE>.pdf
└── logs/
    └── scraper_<site>_<timestamp>.log
```

## 🧠 Cómo funciona

1. **Inicialización**: obtiene la página inicial de JSF y extrae el `javax.faces.ViewState`.
2. **Metadatos**: realiza una búsqueda vacía para actualizar el estado y luego descarga el Excel exportado por PrimeFaces (`DataExporter`). El Excel contiene todos los registros.
3. **UUIDs**: para cada documento, realiza una búsqueda por su número de resolución (identificador único) y extrae el `param_uuid` del enlace de descarga.
4. **PDFs**: envía un POST con los parámetros JSF del enlace y guarda el archivo PDF.
5. **Reintentos**: si ocurre un error de red o HTTP 429, aplica backoff exponencial con jitter.

## ⚠️ Manejo de errores 429 (Too Many Requests)

El scraper detecta respuestas con status `429`, `502`, `503` y `504`, además de errores de red (`ECONNRESET`, `ETIMEDOUT`, etc.). Aplica:

- Hasta 5 reintentos por operación.
- Backoff exponencial: `delay = baseDelay * 2^(intento-1)`.
- Jitter aleatorio para evitar thundering herd.
- Registro de documentos fallidos en `data/progress.json` para reintentos posteriores.

## 🛠️ Estructura del proyecto

```
src/
├── config.ts         # Configuraciones por sitio
├── excel.ts          # Parser del Excel exportado
├── http-client.ts    # Cliente HTTP con cookie jar
├── index.ts          # Punto de entrada
├── jsf-requests.ts   # Construcción de requests JSF/PrimeFaces
├── logger.ts         # Logging a consola y archivo
├── parser.ts         # Parsing de HTML/XML parcial
├── retry.ts          # Retry con backoff exponencial
├── scraper.ts        # Lógica principal del scraper
├── storage.ts        # Persistencia JSON/CSV/PDF
└── types.ts          # Tipos compartidos
```

## 🔧 Adaptar al sitio principal (Poder Judicial)

Para usar el scraper con `https://jurisprudencia.pj.gob.pe/jurisprudenciaweb/faces/page/resultado.xhtml`:

1. Conectarse mediante VPN a Perú.
2. Inspeccionar los IDs reales del formulario, botón de búsqueda, DataTable y botón de exportación a Excel.
3. Actualizar `src/config.ts` → `pjConfig` con los valores correctos.
4. Ejecutar:

```bash
npx cross-env SCRAPER_SITE=pj SCRAPER_MAX_DOWNLOADS=5 npx tsx src/index.ts
```

## 🧪 Pruebas realizadas

- ✅ Obtención de ViewState inicial.
- ✅ Búsqueda AJAX con PrimeFaces.
- ✅ Descarga de Excel con todos los metadatos (1753 registros en OEFA).
- ✅ Búsqueda por número de resolución y extracción de UUID.
- ✅ Descarga de PDFs válidos.
- ✅ Reintentos con backoff (simulados mediante timeouts forzados).

## 📝 Notas

- El scraper no descarga todos los PDFs en una sola ejecución por defecto; usa `SCRAPER_MAX_DOWNLOADS` para controlar el alcance.
- Se incluyen delays aleatorios entre requests para no sobrecargar el servidor.
- Los metadatos se guardan tanto en CSV como en JSON para facilitar su análisis.

## 📄 Licencia

MIT
