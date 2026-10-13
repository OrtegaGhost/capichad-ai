# Limitaciones y cifras reales

CapiChad corre modelos pequeños en equipos de consumo.⁠​‌​​​​‌‌​‌​‌​​​​​‌​​​​‌​​​‌​‌‌​‌​​‌‌​‌​‌​​‌‌​​​‌​​‌‌​​‌‌​‌‌​​​‌​​​‌‌​​​‌​​‌‌​​‌‌​‌‌​​​‌‌​​‌‌​​‌​⁠ Esto es lo que debes esperar, con mediciones hechas en un portátil
**portátil de gama media: Intel Core i5 de 10.ª generación (4 núcleos), 24 GB de RAM, NVIDIA GTX 1650 de 4 GB y SSD NVMe**, Windows 11, Ollama 0.40.3.
En un equipo mejor será más rápido; en uno peor, más lento.

## 1. Plataforma
- **Solo Windows 10/11 de 64 bits (x64).** La app usa PowerShell y rutas de Windows; no se ha probado en macOS ni Linux.
- **Procesadores:** Intel y AMD de 64 bits (se necesita AVX; sin AVX2 todo funciona pero varias veces más lento).
- **Tarjetas gráficas:** NVIDIA (CUDA) acelera el chat y las imágenes. AMD Radeon: Ollama la usa si es una Radeon compatible (ROCm); si no, trabaja con el procesador. Intel (integrada o Arc): el chat usa el procesador. Las imágenes se generan con CPU en AMD/Intel (1–3 min).
- **32 bits: no soportado.** Ollama, PyTorch y los motores de IA no existen para Windows de 32 bits (y un proceso de 32 bits no puede usar más de ~2–4 GB de RAM). Una alternativa viable es usar la app desde otro equipo y apuntar a un Ollama remoto (*Ajustes → Avanzado → Servidor de Ollama*).
- **ARM (Windows on ARM): no soportado por ahora**; podría funcionar con emulación, sin garantías.
- Interfaz **solo en español**.
- El instalador **no está firmado** (SmartScreen avisará) y **no se actualiza solo**: hay que instalar cada versión nueva.

## 2. Calidad de los modelos
- Los modelos de 4B–20B **se equivocan y alucinan más** que los grandes modelos de la nube. Verifica lo importante.
- La biblioteca y el modo conectado mejoran las respuestas (citan fuentes), pero el modelo puede ignorarlas o interpretarlas mal.
- Los modelos "que razonan" (`qwen3:4b`, `gpt-oss`) gastan 1 000+ tokens pensando antes de contestar; por eso el predeterminado
  es `qwen3:4b-instruct`, que responde directo.

## 3. Velocidad (equipo de referencia)
| Modelo | Generación | Cargar el modelo | Leer 2 000 tokens de contexto |
|---|---|---|---|
| `qwen3:4b-instruct` | 16–21 tok/s (4K–8K de contexto) | 5–15 s | ~16 s |
| `gpt-oss:20b` | ~6.6 tok/s | ~55 s | ~29 s |
| `qwen3-coder:30b` | ~10 tok/s | ~35 s | ~41 s — **agota la RAM, no usable como agente** |

Consecuencias reales:
- Pregunta con biblioteca (modelo rápido): **~40 s** hasta terminar de responder; la primera palabra aparece casi enseguida.
- Tarea de *Programar* con el modelo rápido: **30–100 s**; con `gpt-oss:20b`: **~2 min o más** (más si debe corregir).
- Un contexto grande **ralentiza**: el modelo de 4B pasa de 21 → 15.5 → 11.6 tok/s con 4K → 8K → 16K de contexto. La app elige
  el menor que cabe automáticamente.
- Con RAM justa, Windows paginará a disco y todo se vuelve muy lento. Cierra navegadores y otras aplicaciones pesadas.
- Sin GPU NVIDIA el chat funciona, pero más lento.

## 4. Biblioteca
- Las enciclopedias `.zim` **no se incluyen** (decenas o cientos de GB): las descargas tú ([guía](INSTALACION.md#5-biblioteca-sin-conexión-opcional)).
- Con 300+ archivos `.zim` la búsqueda tarda 1–3 s con la caché caliente; tras reiniciar el equipo, la primera puede tardar mucho más
  (se precalienta al abrir la app).
- El OCR de libros escaneados es lento (~2.5 páginas/s con 3 núcleos) y la calidad depende del escaneo. Idiomas del OCR: español e inglés.
- Contenidos como Wikipedia o Stack Exchange tienen licencias (CC BY-SA, etc.) que debes respetar si los redistribuyes.

### Descargas automáticas
- La biblioteca completa son ≈154 GB (≈200–210 GB con modelos e imágenes). Necesitas **ese espacio libre más 25 GB de reserva**.
- Dependen de los servidores públicos de Kiwix (con espejo alterno) y de Ollama. Si caen o cambian los nombres, algunos archivos
  pueden no resolverse: el resumen final los lista y no bloquea el resto.
- El asistente **preselecciona según RAM, GPU y disco**, pero es una estimación basada en un equipo de referencia: los avisos
  son orientativos. En un disco mecánico (HDD) las bibliotecas grandes hacen la búsqueda lenta.
- El instalador de LibreOffice se **extrae** sin permisos de administrador; el generador de imágenes requiere Python 3.10–3.13
  instalado por separado (la app te lo indica).

## 5. Imágenes
- **Con NVIDIA** (CUDA, 4 GB de VRAM o más): ~7 GB de descarga la primera vez. **Con AMD, Intel o sin tarjeta:** se genera con el procesador (~5 GB de descarga, ~6 GB de RAM libres, **1–3 minutos por imagen**; medido en un i5 de 4 núcleos: ~60 s).
- Motor: Stable Diffusion 1.5 (DreamShaper 8 LCM). **512–768 px**, ~15 s (modelo cargado) a ~60 s (en frío) en una GTX 1650.
- **No dibuja texto legible ni maqueta interfaces**; sirve para ilustraciones, fondos y recursos gráficos.
- Mientras se genera una imagen, la app descarga el modelo de lenguaje de la GPU (no caben ambos).

## 6. Modo Programar
- **Ejecuta código generado por un modelo** en tu carpeta (pruebas unittest/pytest/npm test, comprobación de sintaxis).
  No hay entorno aislado: úsalo en proyectos de confianza y revisa lo que escribe. Hace copia de seguridad en
  `<proyecto>\.capichad\` y tiene *Deshacer*.
- Reemplaza **archivos completos** (no parches) y mira ~5 000 caracteres por archivo: no es para refactorizar archivos enormes.
- Verifica con pruebas **solo si existen o las pide la tarea**. Si solo comprueba sintaxis o referencias, el informe lo dice
  ("no hay pruebas"). Las páginas web **no se ejecutan en un navegador**.
- Los modelos de 4B a veces fallan el primer intento; se corrigen con la salida real del error (hasta 3 intentos por defecto).
- Tareas grandes (varios módulos con dependencias) siguen siendo difíciles para estos modelos.
- El agente de terminal **OpenCode** (incluido solo como extra) resultó poco fiable con modelos locales pequeños
  (10–20 min por tarea trivial, errores, o "éxitos" inventados). No lo recomendamos.

## 7. Modo conectado
- Usa servicios públicos **sin clave**: DuckDuckGo (HTML), la API pública de Stack Exchange y Openverse. Pueden **limitar por IP**,
  cambiar o dejar de funcionar; hay caché (6–24 h) y respaldos (Wikipedia, Wikimedia Commons).
- "Sin límite de uso" significa **sin cuotas ni pagos de CapiChad**; no garantiza el trato de terceros.
- **Privacidad:** el texto buscado sale a esos servicios. Desactívalo con *Internet: No*.
- Lo que devuelve internet se trata como **dato no confiable**; la app avisa al modelo de que no obedezca instrucciones de las
  páginas, pero un modelo pequeño no es infalible frente a *prompt injection*.

## 8. Licencias y contenido
- Cada **modelo** tiene su propia licencia (Qwen3 y gpt-oss: Apache-2.0; consulta la de cada uno en su página antes de uso comercial).
- Los **modelos de imágenes** (DreamShaper 8: CreativeML OpenRAIL-M) tienen restricciones de uso: léelas.
- Las imágenes de referencia de internet tienen licencias Creative Commons: la app muestra licencia y autor; **respétalas**.
- Detalle en [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md).

## 9. Qué NO hace (todavía)
- No es multiusuario ni se sincroniza entre equipos.
- No ejecuta páginas web ni apps generadas para validar su apariencia.
- No actualiza modelos ni la biblioteca automáticamente.
- No tiene versión móvil ni de macOS/Linux.
