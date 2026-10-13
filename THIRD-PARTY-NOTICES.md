# Avisos de terceros y licencias

El **código de CapiChad** es [AGPL-3.0-or-later](LICENSE) (con los avisos de autoría de [NOTICE](NOTICE)). CapiChad usa, incluye o descarga componentes de terceros con sus propias
licencias. Este documento es informativo y **no es asesoría legal**; revisa la licencia de cada componente si vas a
redistribuir o a usarlo comercialmente.

## Incluido en el instalador
| Componente | Licencia | Uso |
|---|---|---|
| [Electron](https://www.electronjs.org/) | MIT | Aplicación de escritorio |
| [pdf.js](https://mozilla.github.io/pdf.js/) (`src/vendor`) | Apache-2.0 | Visor de PDF |
| [mammoth](https://github.com/mwilliamson/mammoth.js) | BSD-2-Clause | Leer `.docx` |
| [Python](https://www.python.org/) 3.13 (embebido) | PSF License | Herramientas locales |
| [PyMuPDF](https://pymupdf.readthedocs.io/) | **AGPL-3.0** (o licencia comercial de Artifex) | Leer/renderizar PDF |
| [libzim / python-libzim](https://github.com/openzim/python-libzim) | **GPL-3.0-or-later** | Leer archivos `.zim` de Kiwix |
| [ONNX Runtime](https://onnxruntime.ai/) | MIT | Quitar fondo |
| [NumPy](https://numpy.org/) | BSD-3-Clause (y otras permisivas) | Cálculo |
| [Pillow](https://python-pillow.org/) | MIT-CMU (HPND) | Imágenes |
| flatbuffers, protobuf | Apache-2.0 / BSD-3-Clause | Dependencias de ONNX Runtime |
| [Tesseract OCR](https://github.com/tesseract-ocr/tesseract) 5.4 + `tessdata` (spa, eng, osd) | Apache-2.0 | OCR |
| [U²-Net](https://github.com/xuebinqin/U-2-Net) (`u2net.onnx`, vía [rembg](https://github.com/danielgatis/rembg)) | Apache-2.0 | Quitar fondo |

> **Nota sobre copyleft:** el instalador distribuido incluye PyMuPDF (AGPL-3.0) y libzim (GPL-3.0). Al redistribuir el
> instalador, esos componentes se rigen por sus licencias (el código fuente de CapiChad y las instrucciones para
> reconstruirlo están en este repositorio). Si quieres un binario con una licencia distinta, sustituye esos componentes
> o adquiere la licencia comercial correspondiente.

## Se descarga aparte (no se redistribuye aquí)
| Componente | Licencia | Notas |
|---|---|---|
| [Ollama](https://github.com/ollama/ollama) | MIT | Motor de modelos |
| [LibreOffice](https://www.libreoffice.org/) | MPL-2.0 | Convertir documentos (opcional) |
| Qwen3-4B-Instruct-2507 | Apache-2.0 | Modelo general recomendado |
| gpt-oss-20b (OpenAI) | Apache-2.0 | Modelo de programación |
| nomic-embed-text | Apache-2.0 | Buscador de documentos |
| Qwen2.5-VL-3B | Licencia propia de Qwen (no figura como Apache-2.0 en su ficha) | **Revisa su `LICENSE`** antes de uso comercial |
| DreamShaper 8 LCM (`Lykon/dreamshaper-8-lcm`) | CreativeML OpenRAIL-M | Tiene restricciones de uso: léelas |
| PyTorch, diffusers, transformers, accelerate | BSD-3 / Apache-2.0 | Los instala `instalar_motor_imagenes.py` |

Otros modelos que descargues (Gemma, Llama, Mistral…) tienen sus propias condiciones de uso.

## Contenido que usa la app
- **Archivos `.zim` de [Kiwix](https://kiwix.org/):** Wikipedia (CC BY-SA), Stack Exchange (CC BY-SA con atribución), DevDocs
  (licencias de cada proyecto), Project Gutenberg (dominio público), LibreTexts, iFixit (CC BY-NC-SA)… Cada uno tiene su licencia;
  CapiChad **no los incluye ni los redistribuye**.
- **Imágenes de referencia de internet:** [Openverse](https://openverse.org/) / Wikimedia Commons (Creative Commons). La app muestra
  licencia y autor: respétalos si las publicas.
- **Marca:** el nombre y logotipo "Capibara Software" / "CapiChad" (`assets/`) no están cubiertos por la licencia MIT.
