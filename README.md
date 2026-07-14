# Desafío de Scraping — Scraper JSF/PrimeFaces

Scraper en **TypeScript** que extrae metadatos y descarga PDFs de sitios web basados en **JSF / PrimeFaces** usando únicamente peticiones HTTP (sin Puppeteer, Playwright ni Selenium).

## 🌐 Sitios soportados

| Sitio | Configuración | Notas |
|-------|---------------|-------|
| `oefa` | OEFA — Tribunal de Fiscalización Ambiental | ✅ Probado y funcionando desde cualquier ubicación. |
| `pj` | Poder Judicial del Perú — Jurisprudencia | ✅ Probado con VPN a Perú. Búsqueda por texto + paginación + descarga de PDFs. |

> El sitio principal (`pj`) requiere una conexión desde Perú (o VPN peruana) porque bloquea tráfico internacional.

---

## 🧠 Cómo funciona el sitio OEFA

La URL es:

```
https://publico.oefa.gob.pe/repdig/consulta/consultaTfa.xhtml
```

### Tecnología

Es una aplicación **JSF (JavaServer Faces)** con componentes **PrimeFaces**. Esto significa:

- La página se renderiza en el servidor.
- Existe un campo oculto `javax.faces.ViewState` que debe enviarse en cada POST para mantener el estado de la sesión.
- Las interacciones (búsqueda, paginación, descarga) se hacen mediante POST, muchas vía AJAX parcial (`Faces-Request: partial/ajax`).
- Es imprescindible mantener la cookie de sesión (`JSESSIONID`) entre peticiones.

### Formulario de filtros

El formulario tiene ID `listarDetalleInfraccionRAAForm` y permite filtrar por:

| Campo | ID del input | Tipo |
|-------|--------------|------|
| Número de expediente | `listarDetalleInfraccionRAAForm:txtNroexp` | Texto |
| Administrado | `listarDetalleInfraccionRAAForm:j_idt21` | Texto |
| Unidad fiscalizable | `listarDetalleInfraccionRAAForm:j_idt25` | Texto |
| Sector | `listarDetalleInfraccionRAAForm:idsector` | Select |
| Nro. Resolución de Apelación | `listarDetalleInfraccionRAAForm:j_idt34` | Texto |

Opciones del select **Sector**:

| Valor | Label |
|-------|-------|
| `2` | ELECTRICIDAD |
| `3` | HIDROCARBUROS |
| `9` | INDUSTRIA |
| `1` | MINERIA |
| `8` | PESQUERIA |

El botón de búsqueda tiene ID `listarDetalleInfraccionRAAForm:btnBuscar` y dispara un AJAX que actualiza el panel `listarDetalleInfraccionRAAForm:pgLista`.

### Tabla de resultados

ID del DataTable: `listarDetalleInfraccionRAAForm:dt`

Columnas:

1. **Nro.** — índice de fila.
2. **Número de expediente**
3. **Administrado**
4. **Unidad fiscalizable**
5. **Sector**
6. **Nro. Resolución de Apelación**
7. **Archivo** — icono de descarga del PDF.

La tabla es **scrollable** y está paginada. El paginador tiene ID `listarDetalleInfraccionRAAForm:dt_paginator_bottom`.

### Paginación

El paginador muestra botones numerados (`1`, `2`, `3`, etc.). En PrimeFaces, internamente la paginación AJAX enviaría parámetros como:

- `dt_pagination=true`
- `dt_page=1` (índice 0-based)
- `dt_rows=10`

Sin embargo, **en este sitio la paginación AJAX directa no respondió correctamente** en las pruebas (siempre devolvía la página 1). Por eso el scraper usa una estrategia alternativa:

1. Descarga el **Excel completo** (botón exportar) para obtener todos los metadatos.
2. Para cada documento, realiza una **búsqueda individual por número de resolución**, que devuelve 1 solo resultado.
3. De ese resultado extrae el `param_uuid` del PDF.

### Descarga de PDFs

Cada fila tiene un enlace como este:

```html
<a href="#" onclick="mojarra.jsfcljs(
  document.getElementById('listarDetalleInfraccionRAAForm'),
  {
    'listarDetalleInfraccionRAAForm:dt:0:j_idt63':'listarDetalleInfraccionRAAForm:dt:0:j_idt63',
    'param_uuid':'153a6d2a-cbed-40ef-b8ef-cd2272b19867'
  },
  ''
);return false">
```

Pasos para descargar:

1. Extraer el `param_uuid` del `onclick`.
2. Enviar un POST normal (no AJAX) con:
   - Los campos del formulario.
   - El `javax.faces.ViewState` actual.
   - El `param_uuid`.
   - El ID del componente que disparó la acción.
3. El servidor responde con el archivo PDF, con headers como:
   - `Content-Type: application/octet-stream`
   - `Content-Disposition: attachment;filename="RTFA N° 264-2012.pdf"`

---

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
| `SCRAPER_METADATA_ONLY` | `false` | Si es `true`, solo descarga metadatos. |
| `SCRAPER_MAX_DOWNLOADS` | `0` | Máximo de PDFs a descargar (`0` = ilimitado). |
| `SCRAPER_MAX_PAGES` | `0` | Máximo de páginas de resultados a recorrer (`0` = todas). Solo aplica a `pj`. |
| `SCRAPER_TEXT` | `""` | Texto de búsqueda para el sitio `pj`. |
| `SCRAPER_RETRY_FAILED` | `false` | Si es `true`, reintenta documentos fallidos. |
| `SCRAPER_INTERACTIVE` | `false` | Si es `true`, muestra el menú interactivo en consola. |

### Scripts disponibles

```bash
# Menú interactivo en consola (permite elegir filtros, sector, etc.)
npm run interactive

# Solo metadatos (Excel → CSV/JSON)
npm run metadata
# o solo para pj
npm run metadata:pj

# Descargar todos los PDFs (puede tardar horas)
npm start
# o
npm run start:oefa
npm run start:pj

# Descargar solo 5 PDFs de prueba (OEFA)
npx cross-env SCRAPER_SITE=oefa SCRAPER_MAX_DOWNLOADS=5 npx tsx src/index.ts

# Buscar "aguas" en PJ y descargar 3 PDFs
npx cross-env SCRAPER_SITE=pj SCRAPER_TEXT=aguas SCRAPER_MAX_DOWNLOADS=3 npx tsx src/index.ts

# Reintentar documentos fallidos
npm run retry
```

### 🖥️ Menú interactivo

El menú interactivo guía paso a paso:

1. Pregunta si quieres **solo metadatos** o también PDFs.
2. Permite aplicar **filtros**: para OEFA (número de expediente, administrado, unidad fiscalizable, sector y número de resolución) o para PJ (texto libre).
3. Si eliges descargar PDFs, pregunta si deseas **limitar la cantidad**.
4. Pregunta si quieres **reintentar documentos fallidos**.

Ejemplo de uso para descargar solo 10 PDFs del sector **PESQUERIA**:

```bash
npm run interactive
# → OEFA
# → No (no solo metadatos)
# → Sí (aplicar filtros)
# → Sector: PESQUERIA
# → Sí (limitar PDFs)
# → 10
# → No (no reintentar fallidos)
```

Ejemplo de uso para buscar texto en PJ:

```bash
npm run interactive
# → Poder Judicial del Perú - Jurisprudencia
# → No (no solo metadatos)
# → Sí (aplicar filtros)
# → Texto: derecho ambiental
# → Sí (limitar PDFs)
# → 5
# → No (no reintentar fallidos)
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

## ⚠️ Manejo de errores 429 (Too Many Requests)

El scraper detecta respuestas con status `429`, `502`, `503` y `504`, además de errores de red (`ECONNRESET`, `ETIMEDOUT`, etc.). Aplica:

- Hasta 5 reintentos por operación.
- Backoff exponencial: `delay = baseDelay * 2^(intento-1)`.
- Jitter aleatorio.
- Registro de documentos fallidos en `data/progress.json`.

## 🛠️ Estructura del proyecto

```
src/
├── cli.ts            # Menú interactivo en consola
├── config.ts         # Configuraciones por sitio
├── excel.ts          # Parser del Excel exportado
├── http-client.ts    # Cliente HTTP con cookie jar
├── index.ts          # Punto de entrada
├── jsf-requests.ts   # Construcción de requests JSF/PrimeFaces
├── logger.ts         # Logging a consola y archivo
├── parser.ts         # Parsing de HTML/XML parcial
├── pj-scraper.ts     # Lógica específica del sitio PJ (RichFaces)
├── retry.ts          # Retry con backoff exponencial
├── scraper.ts        # Lógica principal del scraper (OEFA / PrimeFaces)
├── storage.ts        # Persistencia JSON/CSV/PDF
└── types.ts          # Tipos compartidos
```

## 🔧 Cómo funciona el sitio PJ

La URL de inicio es:

```
https://jurisprudencia.pj.gob.pe/jurisprudenciaweb/faces/page/inicio.xhtml
```

### Tecnología

Es una aplicación **JSF** con componentes **RichFaces 4.2.2.Final** (no PrimeFaces). Diferencias clave:

- El formulario de búsqueda general está en `inicio.xhtml`.
- Al hacer clic en **Buscar**, el servidor responde con un redirect `302` a `resultado.xhtml`.
- El redirect usa `http://`, por lo que el scraper debe capturar la `Location` y forzar `https://` para mantener la sesión.
- Los resultados se renderizan en `formBuscador:panel`.
- La paginación usa `rich:dataScroller` (`formBuscador:data1`) y se controla vía AJAX enviando `formBuscador:data1:page=N`.
- Los PDFs se descargan directamente desde `/jurisprudenciaweb/ServletDescarga?uuid=<UUID>`.

### Formulario de búsqueda

| Campo | ID | Notas |
|-------|-----|-------|
| Texto libre | `formBuscador:txtBusqueda` | Busca en el contenido de las resoluciones. |
| Botón general | `formBuscador:j_idt31` | Inicia la búsqueda desde `inicio.xhtml`. |
| Panel de resultados | `formBuscador:panel` | Se actualiza en `resultado.xhtml`. |
| Paginador | `formBuscador:data1` | DataScroller de RichFaces. |

### Descarga de PDFs

Cada resultado incluye un enlace directo:

```html
<a href="/jurisprudenciaweb/ServletDescarga?uuid=39596387-9c0e-4565-acbd-09bd1b98842c">
  <img src=".../btn-ver-resolucion.png" />
</a>
```

El scraper extrae el `uuid` y descarga el PDF con un `GET` a ese servlet.

### Ejecución

```bash
# Solo metadatos (texto = "derecho ambiental")
npx cross-env SCRAPER_SITE=pj SCRAPER_TEXT="derecho ambiental" SCRAPER_METADATA_ONLY=true npx tsx src/index.ts

# Metadatos + 5 PDFs
npx cross-env SCRAPER_SITE=pj SCRAPER_TEXT="derecho ambiental" SCRAPER_MAX_DOWNLOADS=5 npx tsx src/index.ts
```

## 🧪 Pruebas realizadas

- ✅ Obtención de ViewState inicial.
- ✅ Búsqueda AJAX con PrimeFaces (OEFA).
- ✅ Descarga de Excel con todos los metadatos (1753 registros en OEFA).
- ✅ Búsqueda por número de resolución y extracción de UUID (OEFA).
- ✅ Descarga de PDFs válidos.
- ✅ Reintentos con backoff.
- ✅ Menú interactivo con filtros.
- ✅ Flujo RichFaces del Poder Judicial: POST + redirect + paginación AJAX.
- ✅ Descarga de PDFs del PJ vía `ServletDescarga?uuid=...`.

## 📝 Notas

- El scraper no descarga todos los PDFs en una sola ejecución por defecto; usa `SCRAPER_MAX_DOWNLOADS` para controlar el alcance.
- Se incluyen delays aleatorios entre requests para no sobrecargar el servidor.
- Los metadatos se guardan tanto en CSV como en JSON.

## 📄 Licencia

MIT
