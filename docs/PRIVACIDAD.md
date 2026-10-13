# Política de privacidad

**Resumen:** CapiChad funciona en tu equipo. No tiene cuentas, ni telemetría, ni analítica, ni publicidad. Tus chats,
documentos y biblioteca se guardan solo en tu disco. La app solo se conecta a internet para (1) descargar lo que tú
eliges, (2) el **modo internet opcional**, que puedes desactivar al instalar y en cualquier momento, y (3) comprobar
si hay conexión (una petición vacía a `ollama.com`, sin datos tuyos).

*(English summary: no accounts, telemetry or analytics. Data stays on your computer. The app only contacts third parties
to download what you select and, optionally, for the internet mode, which you can disable at installation and any time.)*

## 1. Lo que se guarda y dónde
| Dato | Dónde | Sale de tu equipo |
|---|---|---|
| Chats, documentos añadidos, galería de imágenes | `Documentos\CapiChad` | **No** |
| Biblioteca (libros, `.zim`, base de datos de búsqueda) | `%LOCALAPPDATA%\CapiChad` (o `CAPICHAD_HOME`) | **No** |
| Configuración de la app | `%APPDATA%\CapiChad` | **No** |
| Modelos de IA | Carpeta de Ollama | **No** (se ejecutan localmente) |
| Caché de búsquedas web (solo modo internet) | `%LOCALAPPDATA%\CapiChad\webcache` | **No** |

## 2. Modo internet (opcional)
Con *Internet: Auto* o *Siempre*, para mejorar una respuesta CapiChad puede enviar **el texto de tu pregunta (o palabras
clave extraídas de ella)** a estos servicios de terceros y leer las páginas que devuelven:

| Servicio | Para qué | Política |
|---|---|---|
| DuckDuckGo (html.duckduckgo.com) | Buscar en la web | <https://duckduckgo.com/privacy> |
| Stack Exchange API (api.stackexchange.com) | Respuestas de programación | <https://stackoverflow.com/legal/privacy-policy> |
| Openverse / Wikimedia Commons | Imágenes con licencia abierta | <https://wordpress.org/about/privacy/> · <https://foundation.wikimedia.org/wiki/Policy:Privacy_policy> |
| Wikipedia (respaldo de búsqueda) | Artículos | <https://foundation.wikimedia.org/wiki/Policy:Privacy_policy> |
| Páginas web que devuelve la búsqueda | Leer su texto | Las de cada sitio |

Esos servicios ven tu **dirección IP** y el texto enviado. CapiChad no envía tus archivos, chats completos ni datos
personales; tampoco usa claves ni cuentas. **Cómo desactivarlo:** en el asistente de primer uso, o en el chat con el botón
*Internet: No* (también cierra las búsquedas del modo *Programar*).

## 3. Descargas que tú inicias
Al instalar modelos, bibliotecas o el motor de imágenes, tu equipo se conecta a: `ollama.com` / GitHub (Ollama y modelos),
`download.kiwix.org` y su espejo (bibliotecas), `huggingface.co` (modelo de imágenes), `pypi.org` y `download.pytorch.org`
(componentes de Python), `download.documentfoundation.org` (LibreOffice) y los sitios de libros que elijas copiar. Esos
servidores ven tu IP y qué archivo pides, según sus propias políticas.

## 3 bis. Indicador de conexión
Para mostrar "Con internet / Sin internet", CapiChad hace una petición vacía (`HEAD`) a `https://ollama.com` al abrirse y al
entrar en algunas pantallas. No envía ningún dato tuyo; el servidor ve tu IP como en cualquier visita web. Ollama
(el motor de modelos, que instalas aparte) tiene su propia política: <https://ollama.com/privacy>.

## 4. Lo que CapiChad **no** hace
- No envía informes de uso ni de errores. No identifica a la persona usuaria. No usa cookies de seguimiento.
- No sube tus documentos, chats ni imágenes a ningún servidor.
- No se comunica con servidores del autor.

## 5. Cambios y contacto
Los cambios a esta política se publican en este repositorio (historial de `docs/PRIVACIDAD.md`).
Dudas o reportes: <https://github.com/OrtegaGhost/capichad-ai/issues>.
