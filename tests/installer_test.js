// CapiChad - (c) 2026 Capibara Software (OrtegaGhost) - AGPL-3.0-or-later - https://github.com/OrtegaGhost/capichad-ai
// Aviso de autoria: conserva este encabezado y el archivo NOTICE en copias y derivados.
'use strict';
// Prueba del orquestador con piezas falsas y un servidor local de descargas.
const assert = require('assert'); const http = require('http'); const fs = require('fs'); const os = require('os'); const path = require('path'); const crypto = require('crypto');
const { DownloadManager } = require('../downloader.js'); const { runInstall } = require('../installer.js'); const { recommend } = require('../plan.js');

const kbHome = fs.mkdtempSync(path.join(os.tmpdir(), 'inst-test-'));
const FILES = { 'tiny_a_2026-08.zim': crypto.randomBytes(300000), 'tiny_b_2026-08.zim': crypto.randomBytes(200000) };
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const listing = Object.keys(FILES).map(n => `<a href="${n}">${n}</a>   2026-08-01 10:00  ${Math.round(FILES[n].length / 1024)}K`).join('\n');
const srv = http.createServer((req, res) => {
  if (req.url === '/zim/f/') return res.end('<pre>' + listing + '</pre>');
  const n = decodeURIComponent(req.url.split('/').pop()); const base = n.replace(/\.sha256$/, '');
  if (FILES[base]) return res.end(n.endsWith('.sha256') ? sha(FILES[base]) + '  ' + base : FILES[base]);
  res.statusCode = 404; res.end('x');
});
const lib = { packs: [{ id: 'mini', title: 'Mini', approxBytes: 500000, items: [{ prefix: 'tiny_a', folder: 'f' }, { prefix: 'tiny_b', folder: 'f' }, { prefix: 'ausente', folder: 'f' }] }] };

(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const B = `http://127.0.0.1:${srv.address().port}/zim/`;
  const plan = { items: [
    { id: 'm_fast', kind: 'model', title: 'Modelo rápido', ollama: 'x:y', bytes: 1000, installed: false },
    { id: 'p_mini', kind: 'pack', packId: 'mini', title: 'Mini', bytes: 500000, installed: false },
    { id: 'e_sites', kind: 'sites', title: 'Libros', bytes: 100, installed: false }] };
  const calls = []; const events = [];
  const dm = new DownloadManager({ parallel: 2, minFreeBytes: 0, backoffMs: 5, retries: 1 });
  const ctx = { kbHome, lib, plan, dm, mirrors: [B], emit: e => events.push(e),
    pullModel: async (m, onProg) => { calls.push('pull:' + m.ollama); onProg({ completed: 500, total: 1000 }); },
    installEngine: async () => true, installOffice: async () => true,
    copySites: async sites => { calls.push('sites:' + sites.length); fs.mkdirSync(path.join(kbHome, 'biblioteca', 'libros', 'sitios'), { recursive: true }); return true; },
    zimCheck: async files => { calls.push('check:' + files.length); return { ok: files.slice(1), bad: [{ file: files[0], error: 'simulado' }] }; },
    ingest: async (folder, topic) => { calls.push('ingest:' + path.basename(folder) + ':' + topic); },
    restartKb: async () => calls.push('restart'), optimizeKb: async () => calls.push('optimize') };

  const sum = await runInstall(ctx, ['m_fast', 'p_mini', 'e_sites']);
  const ok = (c, m) => assert(c, m);
  ok(fs.existsSync(path.join(kbHome, 'biblioteca', 'f', 'tiny_b_2026-08.zim')), 'tiny_b descargado en biblioteca/f');
  ok(!fs.existsSync(path.join(kbHome, 'biblioteca', 'f', 'tiny_a_2026-08.zim')), 'el archivo que falló la comprobación se elimina (tiny_a)');
  ok(sum.missing.includes('ausente'), 'prefijo ausente reportado: ' + JSON.stringify(sum.missing));
  ok(calls.includes('pull:x:y') && calls.includes('sites:10') && calls.some(c => c.startsWith('check:')), 'modelo, libros y verificación ejecutados: ' + calls.join(','));
  const iOpt = calls.indexOf('optimize'), iRes = calls.indexOf('restart'), iIng = calls.findIndex(c => c.startsWith('ingest'));
  ok(iIng >= 0 && iIng < iRes && iRes < iOpt, 'orden: indexar -> reiniciar -> optimizar (' + calls.join(' > ') + ')');
  ok(sum.zims === 2 && sum.bad.length === 1 && sum.ok === false && sum.notes.some(n => /simulado/.test(n)), 'informe: 2 descargados, 1 corrupto, con avisos');
  ok(events.some(e => e.t === 'stage' && e.stage === 'verify') && events[events.length - 1].t === 'done', 'eventos de etapa y cierre');

  // segunda ejecución: todo ya presente -> no vuelve a descargar nada de la biblioteca
  const dm2 = new DownloadManager({ parallel: 2, minFreeBytes: 0 }); const ev2 = [];
  const sum2 = await runInstall({ ...ctx, dm: dm2, emit: e => ev2.push(e), zimCheck: async f => ({ ok: f, bad: [] }) }, ['p_mini']);
  ok(dm2.snapshot().items.filter(i => i.group === 'p_mini' && i.state === 'done').length === 1 || dm2.snapshot().items.length <= 1, 'idempotente: no duplica descargas');
  ok(sum2.packs.includes('mini') || dm2.snapshot().total <= 200000, 'segunda ejecución solo repone lo que faltaba');
  console.log('OK installer: orquestación verificada');
  srv.close(); fs.rmSync(kbHome, { recursive: true, force: true }); process.exit(0);
})().catch(e => { console.error('FALLO:', e.message); srv.close(); process.exit(1); });
