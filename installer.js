// CapiChad - (c) 2026 Capibara Software (OrtegaGhost) - AGPL-3.0-or-later - https://github.com/OrtegaGhost/capichad-ai
// Aviso de autoria: conserva este encabezado y el archivo NOTICE en copias y derivados.
'use strict';
// CapiChad - orquestador de instalación (Capibara Software). Sin dependencias de Electron: recibe un contexto (ctx)
// con las operaciones reales (descargar, instalar modelos, indexar…) para poder probarse con piezas falsas.
//
// Flujo (idempotente: si se interrumpe se puede volver a ejecutar y continúa donde iba):
//   resolver archivos -> descargar modelos y .zim (con verificación) -> motor de imágenes / LibreOffice / libros ->
//   reconocer (abrir cada .zim) -> indexar libros -> optimizar y calentar -> informe único.
const fs = require('fs');
const path = require('path');
const { resolveItems } = require('./downloader.js');

// Libros libres que se copian para leer sin conexión (tools/copiar_sitio.py URL CARPETA [páginas])
const SITES = [
  ['Pro_Git', 'https://git-scm.com/book/en/v2', 800], ['Rust_Book', 'https://doc.rust-lang.org/book/', 400],
  ['Think_Python_3e', 'https://allendowney.github.io/ThinkPython/', 300], ['OSTEP', 'https://pages.cs.wisc.edu/~remzi/OSTEP/', 200],
  ['Crafting_Interpreters', 'https://craftinginterpreters.com/', 200], ['Missing_Semester', 'https://missing.csail.mit.edu/', 200],
  ['Automate_Boring_Stuff_3e', 'https://automatetheboringstuff.com/', 300], ['SQL_Use_The_Index_Luke', 'https://use-the-index-luke.com/', 200],
  ['SWE_at_Google', 'https://abseil.io/resources/swe-book/html/', 200], ['Python_Data_Science_Handbook', 'https://jakevdp.github.io/PythonDataScienceHandbook/', 300]
];

const hasPrefix = (dir, prefix) => {
  const re = new RegExp('^' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '_\\d{4}-\\d{2}[a-z]?\\.zim$');
  const walk = d => { let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return false; }
    return ents.some(e => e.isDirectory() ? walk(path.join(d, e.name)) : re.test(e.name)); };
  return walk(dir);
};

/**
 * @param ctx { kbHome, lib(catálogo), plan(items), dm(DownloadManager), mirrors, emit(ev), fetch,
 *              pullModel(item,onProg,signal), installEngine(emit,signal), installOffice(emit,signal), copySites(sites,emit,signal),
 *              zimCheck(files)->{ok:[],bad:[{file,error}]}, ingest(folder,topic,emit), restartKb(), optimizeKb(), signal }
 * @param selected ids del plan (m_*, p_*, e_*)
 */
async function runInstall(ctx, selected) {
  const emit = ctx.emit || (() => {}); const sum = { models: [], packs: [], zims: 0, bytes: 0, missing: [], bad: [], engine: null, office: null, sites: null, notes: [], t0: Date.now() };
  const items = ctx.plan.items.filter(i => selected.includes(i.id) && !i.installed);
  const stage = (s, text) => emit({ t: 'stage', stage: s, text });
  const aborted = () => ctx.signal && ctx.signal.aborted;

  // 1) bibliotecas: resolver al archivo más reciente y encolar
  const packs = items.filter(i => i.kind === 'pack');
  if (packs.length) {
    stage('resolve', 'Buscando las versiones más recientes de la biblioteca…⁠​‌​​​​‌‌​‌​‌​​​​​‌​​​​‌​​​‌​‌‌​‌​​‌‌​‌​‌​​‌‌​​​‌​​‌‌​​‌‌​‌‌​​​‌​​​‌‌​​​‌​​‌‌​​‌‌​‌‌​​​‌‌​​‌‌​​‌​⁠');
    const wanted = [];
    for (const p of packs) {
      const pack = ctx.lib.packs.find(x => x.id === p.packId);
      const need = pack.items.filter(i => !hasPrefix(path.join(ctx.kbHome, 'biblioteca'), i.prefix));
      if (!need.length) { sum.packs.push(p.packId); continue; }
      const { files, missing } = await resolveItems(need, ctx.mirrors, ctx.fetch || fetch);
      missing.forEach(m => sum.missing.push(m));
      files.forEach(f => wanted.push({ ...f, pack: p.packId }));
    }
    for (const f of wanted) {
      ctx.dm.add({ id: 'zim:' + f.name, urls: f.urls, sha256Urls: f.sha256Urls, bytes: f.bytes, title: f.name.replace(/_\d{4}-\d{2}[a-z]?\.zim$/, ''),
        group: 'p_' + f.pack, dest: path.join(ctx.kbHome, 'biblioteca', f.folder, f.name) });
    }
    emit({ t: 'queued', files: wanted.length, bytes: wanted.reduce((s, f) => s + f.bytes, 0), missing: sum.missing });
  }

  // 2) modelos (en paralelo con los .zim; Ollama los reanuda solo)
  const modelWork = (async () => {
    for (const m of items.filter(i => i.kind === 'model')) {
      if (aborted()) return;
      stage('models', `Descargando el modelo «${m.title}»…`);
      try { await ctx.pullModel(m, p => emit({ t: 'item', id: m.id, group: m.id, title: m.title, state: p.done ? 'done' : 'downloading', done: p.completed || 0, bytes: p.total || m.bytes, bps: p.bps || 0 }), ctx.signal);
        sum.models.push(m.ollama); emit({ t: 'item', id: m.id, group: m.id, title: m.title, state: 'done', done: m.bytes, bytes: m.bytes });
      } catch (e) { emit({ t: 'item', id: m.id, group: m.id, title: m.title, state: 'error', error: e.message }); sum.notes.push(`${m.title}: ${e.message}`); }
    }
  })();

  // 3) extras: motor de imágenes, LibreOffice, libros libres
  const extraWork = (async () => {
    await modelWork;
    const eng = items.find(i => i.kind === 'engine'), off = items.find(i => i.kind === 'office'), sites = items.find(i => i.kind === 'sites');
    if (eng && !aborted()) { stage('engine', 'Instalando el generador de imágenes (descarga ~7 GB)…');
      try { sum.engine = await ctx.installEngine(e => emit({ t: 'item', id: eng.id, group: eng.id, title: eng.title, state: 'downloading', ...e }), ctx.signal); emit({ t: 'item', id: eng.id, group: eng.id, title: eng.title, state: sum.engine ? 'done' : 'error', error: sum.engine ? '' : 'No se pudo instalar' }); }
      catch (e) { sum.engine = false; sum.notes.push('Generador de imágenes: ' + e.message); emit({ t: 'item', id: eng.id, group: eng.id, title: eng.title, state: 'error', error: e.message }); } }
    if (off && !aborted()) { stage('office', 'Instalando LibreOffice…');
      try { sum.office = await ctx.installOffice(e => emit({ t: 'item', id: off.id, group: off.id, title: off.title, state: 'downloading', ...e }), ctx.signal); emit({ t: 'item', id: off.id, group: off.id, title: off.title, state: sum.office ? 'done' : 'error' }); }
      catch (e) { sum.office = false; sum.notes.push('LibreOffice: ' + e.message); emit({ t: 'item', id: off.id, group: off.id, title: off.title, state: 'error', error: e.message }); } }
    if (sites && !aborted()) { stage('sites', 'Copiando libros libres de programación…');
      try { sum.sites = await ctx.copySites(SITES, e => emit({ t: 'item', id: sites.id, group: sites.id, title: sites.title, state: 'downloading', ...e }), ctx.signal); emit({ t: 'item', id: sites.id, group: sites.id, title: sites.title, state: 'done' }); }
      catch (e) { sum.sites = false; sum.notes.push('Libros libres: ' + e.message); emit({ t: 'item', id: sites.id, group: sites.id, title: sites.title, state: 'error', error: e.message }); } }
  })();

  // 4) esperar a que terminen las descargas de .zim
  stage('zims', packs.length ? 'Descargando la biblioteca…' : 'Preparando…');
  await new Promise(res => {
    const check = () => { const s = ctx.dm.snapshot(); if (aborted() || s.pending === 0) { ctx.dm.off('item', check); ctx.dm.off('idle', check); res(); } };
    ctx.dm.on('item', check); ctx.dm.on('idle', check); check();
  });
  await Promise.all([modelWork, extraWork]);
  if (aborted()) { emit({ t: 'done', summary: { ...sum, aborted: true } }); return { ...sum, aborted: true }; }

  const snap = ctx.dm.snapshot(); const zimItems = snap.items.filter(i => String(i.id).startsWith('zim:'));
  for (const i of zimItems) { if (i.state === 'done') { sum.zims++; sum.bytes += i.bytes; } else if (['error', 'nospace'].includes(i.state)) sum.notes.push(`${i.title}: ${i.error || i.state}`); }
  const errored = zimItems.filter(i => ['error', 'nospace'].includes(i.state)).length;

  // 5) reconocer: abrir cada .zim y comprobar que tiene índice de texto
  const doneFiles = zimItems.filter(i => i.state === 'done').map(i => i.dest);
  if (doneFiles.length) {
    stage('verify', 'Comprobando que la biblioteca es legible…');
    try { const r = await ctx.zimCheck(doneFiles); sum.bad = r.bad || []; sum.packs.push(...packs.map(p => p.packId).filter(id => !sum.packs.includes(id))); }
    catch (e) { sum.notes.push('Comprobación de la biblioteca: ' + e.message); }
    for (const b of sum.bad) { sum.notes.push(`${path.basename(b.file)}: ${b.error}`); try { fs.unlinkSync(b.file); } catch {} }
  }

  // 6) indexar libros (los libros libres copiados) y 7) aplicar + optimizar
  if (sum.sites) { stage('index', 'Indexando los libros…'); try { await ctx.ingest(path.join(ctx.kbHome, 'biblioteca', 'libros'), 'Programación', e => emit({ t: 'index', ...e })); } catch (e) { sum.notes.push('Indexado: ' + e.message); } }
  stage('optimize', 'Aplicando y optimizando…');
  try { await ctx.restartKb(); } catch (e) { sum.notes.push('Reinicio de la biblioteca: ' + e.message); }
  try { await ctx.optimizeKb(); } catch (e) { sum.notes.push('Optimización: ' + e.message); }

  sum.seconds = Math.round((Date.now() - sum.t0) / 1000); sum.errors = errored + sum.bad.length;
  sum.ok = sum.errors === 0 && !sum.notes.some(n => /No se pudo|falló/i.test(n));
  stage('done', sum.ok ? 'Todo listo' : 'Terminó con avisos');
  emit({ t: 'done', summary: sum });
  return sum;
}

module.exports = { runInstall, SITES, hasPrefix };
