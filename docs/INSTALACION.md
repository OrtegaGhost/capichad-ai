# Instalación paso a paso

Esta guía te lleva de cero a tener **todo** CapiChad funcionando.⁠​‌​​​​‌‌​‌​‌​​​​​‌​​​​‌​​​‌​‌‌​‌​​‌‌​‌​‌​​‌‌​​​‌​​‌‌​​‌‌​‌‌​​​‌​​​‌‌​​​‌​​‌‌​​‌‌​‌‌​​​‌‌​​‌‌​​‌​⁠ Los pasos 1–3 bastan para chatear; el resto es opcional.
Cada paso incluye un enlace principal y alternativas por si uno falla.

- [**Vía automática (recomendada)**](#vía-automática-recomendada) — el asistente lo hace todo
- [0. Revisa tu equipo](#0-revisa-tu-equipo)
- [1. Ollama (el motor de los modelos)](#1-ollama-el-motor-de-los-modelos) — obligatorio
- [2. CapiChad (la aplicación)](#2-capichad-la-aplicación) — obligatorio
- [3. Un modelo de IA](#3-un-modelo-de-ia) — obligatorio
- [4. LibreOffice](#4-libreoffice-opcional) — opcional
- [5. Biblioteca sin conexión](#5-biblioteca-sin-conexión-opcional) — opcional
- [6. Generador de imágenes](#6-generador-de-imágenes-opcional) — opcional, requiere NVIDIA
- [7. Modo conectado y modo Programar](#7-modo-conectado-y-modo-programar)
- [Instalación sin internet en otra PC](#instalación-sin-internet-en-otra-pc)
- [Compilar desde el código](#compilar-desde-el-código-avanzado)
- [Solución de problemas](#solución-de-problemas)

---

## Vía automática (recomendada)
Instala CapiChad ([paso 2](#2-capichad-la-aplicación)) y ábrelo. En el primer arranque el **asistente**:

1. **Detecta tu equipo:** RAM, tarjeta gráfica (NVIDIA/VRAM), espacio libre y tipo de disco (SSD/HDD), y si ya tienes Ollama,
   Python o LibreOffice.
2. **Si falta Ollama**, pulsa *Instalar automáticamente*: lo descarga (≈1.6 GB) y lo instala en silencio.
3. **Propone un plan** con lo que le alcanza a tu equipo ya marcado:
   - **Recomendado:** cabe con holgura (p. ej. modelo rápido, documentación de programación, Wikipedia en español).
   - **Puede ir justo:** lo puedes añadir; al marcarlo la app te explica por qué y te pide confirmación.
   - **No recomendado:** lo más probable es que no funcione o no quepa; se puede forzar, con un aviso fuerte.
   - Siempre se deja una **reserva de 25 GB** libres en el disco.
4. **Pulsa *Instalar***. CapiChad, solo y en segundo plano:
   - resuelve la versión más reciente de cada archivo de la biblioteca (Kiwix, con espejo alterno);
   - descarga con **reanudación** (si se corta internet o cierras la app, continúa donde iba) y verifica **SHA-256**;
   - baja los modelos de Ollama, instala el generador de imágenes y LibreOffice si los elegiste;
   - **reconoce** cada archivo (lo abre y comprueba que es legible), **indexa** los libros, **reinicia** la biblioteca y la
     **optimiza**; al final te muestra un resumen de lo que quedó funcionando.
5. Puedes pausar, detener, limitar la velocidad (5/10/20 MB/s) o **seguir usando CapiChad** mientras descarga.

**Cuánto pesa todo:** modelos ≈ 40 GB (con el de programación y el de visión), biblioteca completa ≈ 154 GB en 8 paquetes
(Stack Overflow completo, ≈107 GB, es opcional), generador de imágenes ≈ 7 GB. En total, **≈ 200–210 GB** si lo eliges todo.
El tiempo depende de tu conexión: a 10 MB/s, unas 6 horas. Más tarde puedes añadir paquetes desde el menú **Descargas**.

**Dónde se guarda:** `%LOCALAPPDATA%\CapiChad` (o `CAPICHAD_HOME`, p. ej. otro disco: `setx CAPICHAD_HOME "D:\CapiChad"` **antes**
de abrir la app). Los modelos van a la carpeta de Ollama (`OLLAMA_MODELS`).

---

## 0. Revisa tu equipo
| Qué | Cómo comprobarlo | Lo que necesitas |
|---|---|---|
| Windows | `Win + R` → `winver` | Windows 10 u 11, **64 bits** |
| Memoria RAM | Administrador de tareas → *Rendimiento → Memoria* | 8 GB mínimo · 16 GB recomendado |
| Procesador | `Win + R` → `msinfo32` (*Procesador*) | Intel o AMD de **64 bits** con AVX; AVX2 recomendado |
| Tarjeta gráfica | Administrador de tareas → *Rendimiento → GPU* | Opcional. NVIDIA/AMD aceleran; Intel usa el procesador |
| Espacio en disco | Explorador → *Este equipo* | ≥ 10 GB para empezar |

**¿Qué modelo me conviene según mi RAM?**
| RAM | Modelo recomendado | Peso |
|---|---|---|
| 8 GB | `qwen3:4b-instruct-2507-q4_K_M` | 2.5 GB |
| 16 GB | el anterior + `gpt-oss:20b` para programar (lento pero posible) | 13 GB |
| 24 GB o más | los dos; con `qwen2.5vl:3b` para entender imágenes | 3.2 GB |

> Un modelo de 30B (p. ej. `qwen3-coder:30b`) ocupa ~19 GB y **no es viable** en 24 GB de RAM para uso real.

---

## 1. Ollama (el motor de los modelos)
Ollama ejecuta los modelos de IA en tu equipo. CapiChad lo necesita.

| Opción | Enlace / comando |
|---|---|
| **Principal** | <https://ollama.com/download> (botón *Download for Windows*) |
| Alterno 1 | Versiones en GitHub: <https://github.com/ollama/ollama/releases/latest> → `OllamaSetup.exe` |
| Alterno 2 (winget) | `winget install Ollama.Ollama` en PowerShell ([qué es winget](https://learn.microsoft.com/windows/package-manager/winget/)) |
| Documentación | <https://docs.ollama.com/windows> |

Comprueba que quedó instalado: abre una terminal y ejecuta `ollama --version`.
Ollama queda corriendo en segundo plano (icono en la bandeja del sistema).

**Opcional – elegir dónde se guardan los modelos** (si tu disco C: es chico): en PowerShell,
`setx OLLAMA_MODELS "D:\modelos-ollama"` y reinicia Ollama.

---

## 2. CapiChad (la aplicación)
| Opción | Enlace |
|---|---|
| **Principal** | Página de versiones: <https://github.com/OrtegaGhost/capichad-ai/releases/latest> → descarga `CapiChad-Setup-<versión>.exe` |
| Alterno | Compilarlo tú mismo: ver [Compilar desde el código](#compilar-desde-el-código-avanzado) |

1. Ejecuta el instalador. **No pide administrador** (se instala solo para tu usuario en
   `%LOCALAPPDATA%\Programs\CapiChad`).
2. **Windows SmartScreen** puede mostrar *"Windows protegió su PC"* porque el instalador no está firmado digitalmente.
   Pulsa **Más información → Ejecutar de todas formas**. Puedes verificar el archivo con
   `Get-FileHash .\CapiChad-Setup-<versión>.exe` y comparar con el SHA-256 publicado en la página de la versión.
3. Abre **CapiChad**. Si Ollama está instalado, la app lo detecta (*Motor activo* abajo a la izquierda).

El instalador ya incluye Python, OCR (Tesseract) y el quitafondos: no instales nada más para esas herramientas.

---

## 3. Un modelo de IA
En una terminal (PowerShell o CMD), con Ollama instalado:

```powershell
ollama pull qwen3:4b-instruct-2507-q4_K_M      # general, rápido, sin razonamiento (recomendado para empezar, 2.5 GB)
```
Opcionales:
```powershell
ollama pull gpt-oss:20b          # programación más capaz y más lento (13 GB; 16-24 GB de RAM)
ollama pull qwen2.5vl:3b         # entiende imágenes y capturas (3.2 GB)
ollama pull nomic-embed-text     # buscador semántico de tus documentos (0.3 GB)
```
Catálogos para elegir otros: <https://ollama.com/library/qwen3> · <https://ollama.com/library/gpt-oss> ·
<https://ollama.com/library/qwen2.5vl> · <https://ollama.com/library/nomic-embed-text>.

**Alternativa sin `ollama pull`** (por ejemplo, otra PC sin internet): descarga un archivo `.gguf` desde Hugging Face
(<https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF>, original: <https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507>)
y en CapiChad ve a *Modelos → Añadir modelo → Importar desde mi equipo*.

Después abre CapiChad → *Modelos*: debería aparecer como **"Modelo general rápido"** y quedar como predeterminado.

*(Opcional, solo si usarás el enrutador de OpenCode: `ollama cp qwen3:4b-instruct-2507-q4_K_M qwen3:4b-instruct`
crea el nombre corto que ese enrutador espera.)*

> **Las respuestas con modelos de 4B no son perfectas.** Lee [LIMITES.md](LIMITES.md) para saber qué esperar.

---

## 4. LibreOffice (opcional)
Solo para *Herramientas → Convertir documentos* (Word/Excel/PowerPoint → PDF) y para indexar archivos `.doc` antiguos.

| Opción | Enlace |
|---|---|
| **Principal** | <https://www.libreoffice.org/download/download-libreoffice/> |
| Alterno 1 | Servidor de descargas directas: <https://download.documentfoundation.org/libreoffice/stable/> |
| Alterno 2 (winget) | `winget install TheDocumentFoundation.LibreOffice` |

---

## 5. Biblioteca sin conexión (opcional)
La biblioteca tiene dos tipos de contenido; puedes usar uno, el otro o ambos.

### 5a. Enciclopedias y documentación (`.zim`)
Archivos del proyecto [Kiwix](https://kiwix.org/en/applications/): Wikipedia, documentación de programación, Stack Exchange…

1. Elige los que quieras en <https://library.kiwix.org/> (catálogo con buscador) o directamente en la carpeta de descargas:
   <https://download.kiwix.org/zim/>. **Alternativas si el servidor va lento:** <https://mirror.download.kiwix.org/zim/>, y en esa
   misma carpeta cada archivo ofrece su versión `.torrent`.
2. Descarga los archivos `.zim`. Punto de partida sugerido:

   | Contenido | Dónde | Archivo (ejemplo) | Tamaño |
   |---|---|---|---|
   | Documentación de programación (DevDocs, ~230 archivos pequeños) | <https://download.kiwix.org/zim/devdocs/> | `devdocs_en_python_2026-08.zim`, `devdocs_en_git_…`, `devdocs_en_javascript_…`, `devdocs_en_docker_…` | 1–50 MB c/u |
   | Wikipedia en español, sin imágenes | <https://download.kiwix.org/zim/wikipedia/> | `wikipedia_es_all_nopic_2026-08.zim` | ~11 GB |
   | Wikipedia en español, versión *mini* (más liviana) | misma carpeta | `wikipedia_es_all_mini_2026-08.zim` | mucho menor |
   | Wikipedia en inglés, sin imágenes | misma carpeta | `wikipedia_en_all_nopic_2026-06.zim` | ~49 GB |
   | Preguntas y respuestas técnicas | <https://download.kiwix.org/zim/stack_exchange/> | `superuser.com_en_all_…`, `unix.stackexchange.com_en_all_…`, `stackoverflow.com_en_all_…` (≈100 GB) | 1–110 GB |
   | Libros de dominio público | <https://download.kiwix.org/zim/gutenberg/> | `gutenberg_es_all_…` | ~1.7 GB |
   | Textos universitarios | <https://download.kiwix.org/zim/libretexts/> | `libretexts.org_en_math_…`, etc. | 0.2–4 GB |
   | Guías de reparación | <https://download.kiwix.org/zim/ifixit/> | `ifixit_es_all_…` | ~3 GB |

   *(Los nombres llevan la fecha de publicación; usa la versión más reciente que veas en la carpeta.)*
3. En CapiChad abre **Biblioteca → Abrir carpeta** y copia ahí los `.zim` (pueden ir en subcarpetas). La carpeta es
   `%LOCALAPPDATA%\CapiChad\biblioteca` (o `<CAPICHAD_HOME>\biblioteca`, ver abajo). **No hay que indexar nada**: se usan
   solos en la siguiente pregunta.

### 5b. Tus propios libros y documentos
1. *Biblioteca → Añadir carpeta de libros* y elige la carpeta (PDF, TXT, MD, HTML, DOCX, PPTX, DOC).
2. Se indexan en una base SQLite local. Si hay PDFs escaneados, aparece **Hacer OCR ahora** (tarda; usa varios núcleos).
3. Para guardar la documentación de una web completa (libros en línea con licencia libre) como material indexable, usa
   `tools\copiar_sitio.py` (ver [DESARROLLO.md](DESARROLLO.md)). Ejemplos con licencia abierta que funcionan bien:
   [Pro Git](https://git-scm.com/book/en/v2), [The Rust Book](https://doc.rust-lang.org/book/),
   [Think Python](https://allendowney.github.io/ThinkPython/), [OSTEP](https://pages.cs.wisc.edu/~remzi/OSTEP/),
   [Crafting Interpreters](https://craftinginterpreters.com/), [Missing Semester](https://missing.csail.mit.edu/),
   [Automate the Boring Stuff](https://automatetheboringstuff.com/), [Use The Index, Luke](https://use-the-index-luke.com/).

**Cambiar la ubicación** (otro disco): define la variable de entorno de usuario `CAPICHAD_HOME`, por ejemplo
`setx CAPICHAD_HOME "D:\CapiChad"`, y reinicia la app. Dentro irán `biblioteca\` y `datos\`.

---

## 6. Generador de imágenes (opcional)
Funciona en **cualquier equipo de 64 bits**: con **tarjeta NVIDIA** (4 GB de VRAM o más) usa la GPU (~7 GB de descarga, 512×512 en
~15–60 s); con **AMD, Intel o solo procesador** usa la CPU (~5 GB, **1–3 minutos por imagen**, ~6 GB de RAM libres). El instalador
elige el modo solo. Necesitas **9 GB libres** durante la conversión. Genera con Stable Diffusion 1.5 (DreamShaper 8 LCM).

**Previos**
| Qué | Principal | Alterno |
|---|---|---|
| Controlador gráfico al día (opcional) | NVIDIA: <https://www.nvidia.com/Download/index.aspx> · AMD: <https://www.amd.com/en/support/download/drivers.html> | App de NVIDIA: <https://www.nvidia.com/en-us/software/nvidia-app/> · Intel: <https://www.intel.com/content/www/us/en/download-center/home.html> |
| Python **3.10 a 3.13** (solo para crear el entorno) | <https://www.python.org/downloads/windows/> (marca *Add python.exe to PATH*) | `winget install Python.Python.3.12` · FTP: <https://www.python.org/ftp/python/> |

**Instalación (elige una)**
1. **Desde la app:** *Imágenes → Instalar el motor de imágenes*. Se abre una consola que descarga y prueba todo.
2. **A mano:** en PowerShell,
   ```powershell
   py -3 "$env:LOCALAPPDATA\Programs\CapiChad\resources\tools\instalar_motor_imagenes.py"
   ```
   (con el código fuente: `py -3 tools\instalar_motor_imagenes.py`).

El script crea un entorno aislado en `%LOCALAPPDATA%\CapiChad\imagegen`, instala PyTorch con CUDA y descarga el modelo
[`Lykon/dreamshaper-8-lcm`](https://huggingface.co/Lykon/dreamshaper-8-lcm). Es seguro repetirlo: omite lo ya hecho.

**Alternativas si algo falla**
- Otra versión de CUDA: `… instalar_motor_imagenes.py --cuda cu124` (índices: <https://download.pytorch.org/whl/cu126/>,
  <https://download.pytorch.org/whl/cu124/>; guía de PyTorch: <https://pytorch.org/get-started/locally/>).
- Hugging Face lento o bloqueado: antes de ejecutar, `setx HF_ENDPOINT https://hf-mirror.com` (espejo) y abre una terminal nueva.
- Índice de PyTorch propio/espejo: `--torch-index <URL>`.
- Otra carpeta: variable `CAPICHAD_IMAGEGEN`.

---

## 7. Modo conectado y modo Programar
- **Internet:** en el chat, el botón *Internet* alterna **Auto** (consulta la web si la pregunta pide algo reciente o la
  biblioteca no basta) · **Siempre** · **No**. No necesita configuración ni claves.
- **Programar:** menú *Programar* → elige la carpeta del proyecto → describe la tarea → *Programar*. Elige el modelo
  (rápido para tareas pequeñas; el de programación para tareas más difíciles). Ejemplos de tareas que funcionan bien:
  *"Crea una calculadora en Python con pruebas unittest"*, *"Los tests de test_x.py fallan: corrige x.py sin modificar los tests"*.
  Cada ejecución guarda una copia en `<proyecto>\.capichad\` y puedes pulsar **Deshacer cambios**.
- **Agente de terminal OpenCode (no recomendado):** el repo incluye un enrutador para [OpenCode](https://opencode.ai/), pero
  con modelos locales pequeños resultó poco fiable; usa *Programar*.

---

## Instalación sin internet en otra PC
En una PC con internet reúne en una USB: `OllamaSetup.exe`, `CapiChad-Setup-<versión>.exe` y, si quieres, el MSI de LibreOffice.
Los modelos se copian como archivos `.gguf` (paso 3, alternativa) o copiando la carpeta de modelos de Ollama
(`%USERPROFILE%\.ollama\models`). Los `.zim` se copian a la carpeta de la biblioteca. El motor de imágenes necesita internet
la primera vez (o copiar la carpeta `%LOCALAPPDATA%\CapiChad\imagegen` ya instalada).

---

## Compilar desde el código (avanzado)
Solo si quieres modificar CapiChad. Necesitas [Node.js LTS](https://nodejs.org/en/download) y
[Git](https://git-scm.com/download/win).

```powershell
git clone https://github.com/OrtegaGhost/capichad-ai.git
cd capichad-ai
npm install
```
El instalador empaqueta una carpeta `tools\` con componentes pesados que **no están en git** y debes preparar antes de
compilar (si solo quieres ejecutar en modo desarrollo, `npm start` basta, usando el Python y Tesseract del sistema):

| Carpeta | Contenido | De dónde sale |
|---|---|---|
| `tools\python\` | Python 3.13 **embebido** + paquetes: `pymupdf`, `libzim`, `onnxruntime`, `numpy`, `pillow` | [Python embeddable package](https://www.python.org/downloads/windows/) + `get-pip.py` y `pip install --target` |
| `tools\tesseract\` | Tesseract 5 portable con `tessdata\spa.traineddata`, `eng.traineddata`, `osd.traineddata` | [Instalador UB Mannheim](https://github.com/UB-Mannheim/tesseract/wiki) (copiar la carpeta instalada) |
| `tools\modelos\u2net.onnx` | Modelo de quitar fondo | [u2net.onnx de rembg](https://github.com/danielgatis/rembg/releases/tag/v0.0.0) |

Luego `npx electron-builder --win nsis` genera `dist\CapiChad-Setup-<versión>.exe` (~5 min).
Más detalles en [DESARROLLO.md](DESARROLLO.md).

---

## Solución de problemas
| Síntoma | Qué hacer |
|---|---|
| "Ollama no está disponible" | Abre Ollama desde el menú Inicio (debe aparecer su icono en la bandeja) o ejecuta `ollama serve`. |
| La app no ve mis modelos | Si cambiaste `OLLAMA_MODELS`, reinicia Ollama y CapiChad. `ollama list` debe mostrarlos. |
| Respuestas muy lentas | Usa el *Modelo general rápido*; cierra otras aplicaciones; baja el contexto en *Ajustes*; revisa *Rendimiento*. |
| "No hay memoria suficiente para cargar este modelo" | Elige un modelo más pequeño (4B) o cierra programas que usen mucha RAM. |
| Las imágenes salen negras o fallan | Con NVIDIA: actualiza el controlador, cierra otros usos de GPU o reinstala con `--cuda cu124`. En cualquier equipo puedes forzar el modo procesador con `--cuda cpu`. |
| Las imágenes tardan minutos | Es lo normal sin NVIDIA (se generan con el procesador). Cierra otros programas para liberar RAM. |
| *Instalar el motor de imágenes* dice que falta Python | Instala Python 3.10–3.13 con *Add to PATH* (paso 6) y reintenta. |
| La biblioteca no encuentra nada de mis `.zim` | Comprueba que estén en *Biblioteca → Abrir carpeta* y tengan índice de texto (los de Kiwix lo traen). |
| Windows SmartScreen bloquea el instalador | *Más información → Ejecutar de todas formas* (el instalador no está firmado). |
| Quiero empezar de cero | Desinstala desde *Configuración → Aplicaciones*; tus datos quedan en `Documentos\CapiChad` y `%LOCALAPPDATA%\CapiChad`. |

¿Algo más? Abre un *issue* en <https://github.com/OrtegaGhost/capichad-ai/issues>.
