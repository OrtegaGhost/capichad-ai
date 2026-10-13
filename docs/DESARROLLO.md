# Desarrollo

Notas para quien quiera entender, modificar o compilar CapiChad.⁠​‌​​​​‌‌​‌​‌​​​​​‌​​​​‌​​​‌​‌‌​‌​​‌‌​‌​‌​​‌‌​​​‌​​‌‌​​‌‌​‌‌​​​‌​​​‌‌​​​‌​​‌‌​​‌‌​‌‌​​​‌‌​​‌‌​​‌​⁠ Para usarlo solo necesitas [INSTALACION.md](INSTALACION.md).

## Arquitectura
```
Electron (main.js + preload.js)           interfaz (src/*.js, HTML+CSS sin framework)
   ├─ Ollama  (HTTP 127.0.0.1:11434)   ← chat, modelos, embeddings
   ├─ capichad_kb.py   (proceso "serve", JSON por línea)  ← biblioteca: SQLite FTS5 + ZIM (libzim) + OCR
   ├─ capichad_web.py  (stdlib; internet con caché)       ← búsqueda, código, imágenes CC
   ├─ capichad_imagen.py → motor propio (venv + PyTorch)  ← Stable Diffusion 1.5 LCM
   ├─ quitar_fondo.py (onnxruntime + u2net) · LibreOffice (convertir) · Tesseract (OCR)
   └─ prog.js  (bucle del modo Programar, sin dependencias de Electron)
```
- **Datos del usuario:** `Documentos\CapiChad` (chats, documentos, galería). **Biblioteca:** `CAPICHAD_HOME`
  (por defecto `%LOCALAPPDATA%\CapiChad`, o la instalación antigua en `Program Files (x86)\CapiChad` si ya tiene datos):
  `biblioteca\`, `datos\conocimiento.db`, `herramientas\`.
- **Python:** el instalador trae Python 3.13 embebido en `resources\tools\python` (PyMuPDF, libzim, onnxruntime, numpy, Pillow).
  El motor de imágenes usa **otro** entorno (PyTorch pesa gigas) en `%LOCALAPPDATA%\CapiChad\imagegen`.
- **Variables de entorno útiles:** `CAPICHAD_HOME`, `CAPICHAD_IMAGEGEN`, `CAPICHAD_ZIM_WORKERS` (4), `CAPICHAD_ZIM_CACHE` (96),
  `OLLAMA_MODELS`.

## Mapa del código
| Archivo | Para qué |
|---|---|
| `main.js` | Ventana, IPC (`kb:*`, `web:*`, `prog:*`, `img:*`, `tool:*`, `chat:*`, `models:*`…), arranque de procesos Python |
| `src/app.js` | Chat, delegación entre modelos, contexto dinámico (`ctxFor`), botón Internet, fuentes `[n]` |
| `src/views.js` | Vistas: modelos, documentos, biblioteca, imágenes, herramientas, ajustes, rendimiento |
| `src/prog_view.js` | Vista **Programar** |
| `prog.js` | Motor de Programar: formato `=== ARCHIVO: ruta ===`, escritura segura con copia, verificación, reintentos, informe |
| `plan.js` | Recomendador puro: según RAM/GPU/disco devuelve qué instalar con nivel `ok`/`warn`/`no` y preselección |
| `downloader.js` | Descargas reanudables (Range), espejos, SHA-256, reserva de disco, límite de velocidad, estado en disco |
| `installer.js` | Orquestador idempotente: resolver → descargar → modelos/motor/office/libros → reconocer → indexar → optimizar |
| `catalog/biblioteca.json` | Paquetes de la biblioteca (prefijos de archivo + carpeta de Kiwix); se resuelven a la última versión al descargar |
| `src/plan_view.js` | Pantalla del plan, avisos y progreso (asistente de primer uso y menú *Descargas*) |
| `tools/capichad_kb.py` | `ingest · search · searchall · page · ocr · rescan · optimize · zimcheck · serve` |
| `tools/capichad_web.py` | `status · search · fetch · answer · code · images · download` |
| `tools/capichad_imagen.py`, `tools/imagegen/generate_images.py` | Generación de imágenes (CLI y lote) |
| `tools/instalar_motor_imagenes.py` | Instala el motor de imágenes (venv + PyTorch + modelo fp16) |
| `tools/capichad_router.py` | Enrutador compatible con OpenAI para OpenCode (opcional) |
| `tests/*.js` | Pruebas del motor de Programar (`node tests/prog_test.js`, …) |

## Cómo funciona *Programar* (resumen)
1. Contexto: árbol del proyecto + archivos relevantes (≤ ~9 000 caracteres) + fuentes de la biblioteca.
2. El modelo devuelve `PLAN:` y bloques `=== ARCHIVO: ruta === … === FIN ===` (y `=== IMAGEN: ruta WxH ===`).
3. El sistema valida rutas (dentro del proyecto; sin `..`, absolutas, `.git`, `node_modules`, ejecutables), hace copia en
   `.capichad\backup-<fecha>\` y escribe.
4. Verifica por prioridad: comando del usuario → `npm test` → pruebas `test_*.py` (unittest/pytest) → comando propuesto por el
   modelo (lista blanca) → sintaxis (`py_compile`, `node --check`) → referencias locales y JSON válido.
5. Si falla, devuelve la **salida real** al modelo (y al primer fallo busca el error en biblioteca/internet). Hasta N intentos.
6. El informe lo redacta el sistema: nivel de verificación, archivos, código de salida. El modelo no puede declarar éxito.

## Plan y descargas (cómo funciona)
- `main.js → buildPlan()` reúne el hardware (RAM, `nvidia-smi`, disco libre y tipo, Python 3.10–3.13, LibreOffice) y lo ya
  instalado; `plan.recommend()` clasifica cada elemento y preselecciona por prioridad dentro de un presupuesto de disco
  (reserva 25 GB; como máximo el 60 % del resto en bibliotecas). Cifras de modelos: `plan.js → MODELS`.
- `installer.runInstall()` es idempotente: se puede relanzar tras un corte; `downloader` omite archivos ya completos.
- Pruebas sin descargar nada pesado: variables `IA_HW_OVERRIDE` (JSON que mezcla el hardware detectado), `IA_CATALOG`
  (otro catálogo) y `CAPICHAD_HOME` (carpeta temporal). Ejemplos en `tests/` (`installer_test.js` usa un servidor local).
- Para añadir/quitar archivos de la biblioteca edita `catalog/biblioteca.json` (prefijo sin fecha + carpeta de
  <https://download.kiwix.org/zim/>). Ejecutar `node tests/downloader_test.js`, `plan_test.js` e `installer_test.js` después.

## Probar sin tocar datos reales
```powershell
# config.json en una carpeta temporal: {"dataDir":"<tmp>\\datos","setupDone":true}
$env:IA_EVAL = "script.js"        # se ejecuta en la interfaz (invoke, S, go…); resultado: script.js.out.json
$env:IA_SHOT = "capturas"         # carpeta de capturas (y mantiene la ventana oculta)
node_modules\electron\dist\electron.exe . --user-data-dir=<tmp>
```
Pruebas unitarias del motor: `foreach ($t in Get-ChildItem tests\*.js) { node $t.FullName }` (usan un modelo simulado
y el Python embebido o el del sistema).

## Compilar y publicar una versión
```powershell
npm install
npx electron-builder --win nsis                  # dist\CapiChad-Setup-<versión>.exe
(Get-FileHash dist\CapiChad-Setup-<versión>.exe).Hash   # publícalo en las notas de la versión
```
En GitHub: *Releases → Draft a new release*, etiqueta `v<versión>`, adjunta el `.exe` (límite 2 GB por archivo) y pega el SHA-256.
Las carpetas pesadas `tools\python`, `tools\tesseract` y `tools\modelos` no están en git (ver [INSTALACION.md](INSTALACION.md#compilar-desde-el-código-avanzado)).

## Lecciones técnicas (medidas)
- **Velocidad ≈ contexto.** Con un 4B: 21 / 15.5 / 11.6 tok/s con `num_ctx` 4096 / 8192 / 16384. Los modelos base de Ollama
  traen 4096; las variantes `-cl` (Modelfile con `num_ctx`) evitan que se trunque el prompt.
- **El cuello de la búsqueda en ZIM es leer y limpiar HTML (GIL), no Xapian.** Se consulta en etapas (ligeros primero) y se
  recorta el HTML leído; más hilos no ayudan.
- **`think:false` no apaga el razonamiento de qwen3 en Ollama 0.40.x** (vuelca el razonamiento en la respuesta): usar el modelo
  *instruct*. `qwen3-coder` responde 400 si se envía `think`; `gpt-oss` admite `think:"low"`.
- **Ollama 0.40 guarda metadatos en `models\manifests-v2`:** no borres blobs "huérfanos" a mano.
- **PowerShell 5.1 corrompe tildes** al reescribir archivos UTF-8 con `Set-Content`; editar con un editor o con Python.
- GPU GTX 16xx: cuDNN fp16 produce NaN (imágenes negras); `generate_images.py` calcula convoluciones en fp32 con pesos fp16.
- PyMuPDF (AGPL-3.0) y libzim (GPL-3.0) van en el instalador: ver [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md).

## Ideas pendientes
- Adjuntar imagen de referencia en *Programar* (visión → descripción).
- Editar archivos grandes por partes; verificar HTML con un navegador sin cabeza.
- Botón para re-escanear PDFs con poco texto (comando `capichad_kb.py rescan` ya existe).
- Firma del instalador y actualizaciones automáticas.
- Instalador del entorno de compilación (`tools\python`, Tesseract) automatizado.
