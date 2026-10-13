# Cómo contribuir

¡Gracias por querer ayudar! CapiChad es un proyecto personal y gratuito; toda ayuda es bienvenida.

## Reportar un problema
Abre un *issue* en <https://github.com/OrtegaGhost/capichad-ai/issues> e incluye:
- Versión de CapiChad (*Ajustes* o el nombre del instalador) y de Ollama (`ollama --version`).
- Tu equipo: RAM, tarjeta gráfica y Windows (el panel *Rendimiento* lo muestra).
- Qué esperabas, qué pasó y los pasos para repetirlo. Capturas ayudan; **no incluyas datos personales**.

## Proponer cambios
1. Haz un *fork* y una rama por cambio.
2. Prepara el entorno: [docs/DESARROLLO.md](docs/DESARROLLO.md) (`npm install`, `npm start`).
3. Ejecuta las pruebas: `foreach ($t in Get-ChildItem tests\*.js) { node $t.FullName }`.
4. Mantén el estilo del código existente (sin frameworks nuevos si no hace falta; comentarios en español).
5. Abre un *pull request* explicando el *porqué* del cambio y cómo lo probaste.

## Ideas donde más se necesita ayuda
- Pruebas en equipos distintos (otras GPU, 8 GB de RAM) y reportar cifras reales.
- Soporte para macOS/Linux, traducción de la interfaz, firma del instalador.
- Mejoras del modo *Programar* (ver "Ideas pendientes" en [docs/DESARROLLO.md](docs/DESARROLLO.md)).
- Documentación y guías de uso.

## Seguridad
Si encuentras una vulnerabilidad, no la publiques en un *issue*: escribe primero al mantenedor (ver el perfil del repositorio).
