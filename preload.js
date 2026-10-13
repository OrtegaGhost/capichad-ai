// CapiChad - (c) 2026 Capibara Software (OrtegaGhost) - AGPL-3.0-or-later - https://github.com/OrtegaGhost/capichad-ai
// Aviso de autoria: conserva este encabezado y el archivo NOTICE en copias y derivados.
const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('api', {
  pathOf: f => webUtils.getPathForFile(f),
  invoke: (name, ...args) => ipcRenderer.invoke(name, ...args),
  on: (ch, cb) => { const f = (_e, d) => cb(d); ipcRenderer.on(ch, f); return () => ipcRenderer.removeListener(ch, f); }
});
