// CapiChad - (c) 2026 Capibara Software (OrtegaGhost) - AGPL-3.0-or-later - https://github.com/OrtegaGhost/capichad-ai
// Aviso de autoria: conserva este encabezado y el archivo NOTICE en copias y derivados.
'use strict';
// Pruebas del motor de descargas con un servidor HTTP local (rangos, cortes, espejos, hash).
const assert = require('assert'); const http = require('http'); const fs = require('fs'); const os = require('os'); const path = require('path'); const crypto = require('crypto');
const { DownloadManager, parseListing, latestFor, resolveItems } = require('../downloader.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dl-test-'));
const BIG = crypto.randomBytes(5 * 1024 * 1024); const SHA = crypto.createHash('sha256').update(BIG).digest('hex');
const stats = { ranges: 0, hits: {}, cutOnce: true };
let mode = 'normal';
const listing = `<html><body><pre><a href="a_2026-05.zim">a_2026-05.zim</a>   2026-05-10 13:59  4.0M
<a href="a_2026-08.zim">a_2026-08.zim</a>   2026-08-08 14:41  5.0M
<a href="b_2026-08a.zim">b_2026-08a.zim</a>   2026-08-09 10:00  11G
<a href="b_2026-08.zim">b_2026-08.zim</a>   2026-08-01 10:00  10G
<a href="other.txt">other.txt</a> 2026-08-01 10:00 1K</pre></body></html>`;

const srv = http.createServer((req, res) => {
  stats.hits[req.url] = (stats.hits[req.url] || 0) + 1;
  if (req.url === '/m1/f/') { res.end(listing); return; }
  if (req.url === '/m2/f/') { res.end(listing); return; }
  if (req.url.startsWith('/dead/')) { res.statusCode = 500; res.end('x'); return; }
  if (/\.sha256$/.test(req.url)) { res.end((mode === 'badhash' ? 'deadbeef'.repeat(8) : SHA) + '  a_2026-08.zim\n'); return; }
  if (/a_2026-08\.zim$/.test(req.url)) {
    let start = 0; const r = /bytes=(\d+)-/.exec(req.headers.range || '');
    if (r) { start = +r[1]; stats.ranges++; res.statusCode = 206; res.setHeader('Content-Range', `bytes ${start}-${BIG.length - 1}/${BIG.length}`); }
    res.setHeader('Content-Length', BIG.length - start);
    const body = BIG.subarray(start);
    if (mode === 'cut' && stats.cutOnce && start === 0) { stats.cutOnce = false; res.write(body.subarray(0, 1024 * 1024)); setTimeout(() => req.socket.destroy(), 30); return; }
    if (mode === 'slow') { let o = 0; const iv = setInterval(() => { if (o >= body.length) { clearInterval(iv); res.end(); return; } res.write(body.subarray(o, o += 256 * 1024)); }, 40); req.on('close', () => clearInterval(iv)); return; }
    res.end(body); return;
  }
  res.statusCode = 404; res.end('no');
});

const wait = (m, pred, ms = 20000) => new Promise((ok, no) => { const t0 = Date.now(); const iv = setInterval(() => { if (pred()) { clearInterval(iv); ok(); } else if (Date.now() - t0 > ms) { clearInterval(iv); no(new Error('timeout esperando estado')); } }, 25); });
const mk = (extra = {}) => new DownloadManager({ parallel: 2, minFreeBytes: 0, backoffMs: 10, retries: 3, ...extra });

(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const B = `http://127.0.0.1:${srv.address().port}`;
  let n = 0; const ok = (c, m) => { n++; assert(c, m); };

  // 1) listado y resolución del archivo más reciente
  const L = parseListing(listing);
  ok(L.length === 4 && L[2].bytes === 11 * 1024 ** 3, 'parseListing: 4 archivos .zim con tamaño');
  ok(latestFor(L, 'a').name === 'a_2026-08.zim', 'latestFor elige la fecha más nueva');
  ok(latestFor(L, 'b').name === 'b_2026-08a.zim', 'latestFor entiende el sufijo de letra (a)');
  ok(latestFor(L, 'zzz') === null, 'prefijo inexistente');
  const rs = await resolveItems([{ prefix: 'a', folder: 'f' }, { prefix: 'nope', folder: 'f' }], [B + '/m1/', B + '/m2/']);
  ok(rs.files.length === 1 && rs.missing[0] === 'nope' && rs.files[0].urls.length === 2 && rs.files[0].urls[0] === B + '/m1/f/a_2026-08.zim', 'resolveItems con espejos y faltantes');
  const rs2 = await resolveItems([{ prefix: 'a', folder: 'f' }], ['http://127.0.0.1:1/x/', B + '/m2/']);   // primer espejo caído
  ok(rs2.files.length === 1, 'resolveItems usa el segundo espejo si el primero no responde');

  // 2) descarga normal + hash
  let dm = mk(); const d1 = path.join(tmp, 'ok', 'a.zim');
  dm.add({ id: 'a', urls: [B + '/m1/f/a_2026-08.zim'], sha256Urls: [B + '/m1/f/a_2026-08.zim.sha256'], dest: d1 });
  await wait(dm, () => dm.items.get('a').state === 'done');
  ok(fs.readFileSync(d1).equals(BIG) && !fs.existsSync(d1 + '.part'), 'archivo íntegro y sin .part');

  // 3) espejo caído -> usa el siguiente
  dm = mk(); const d2 = path.join(tmp, 'mirror', 'a.zim');
  dm.add({ id: 'm', urls: [B + '/dead/f/a_2026-08.zim', B + '/m1/f/a_2026-08.zim'], sha256Urls: [B + '/m1/f/a_2026-08.zim.sha256'], dest: d2 });
  await wait(dm, () => dm.items.get('m').state === 'done');
  ok(fs.readFileSync(d2).equals(BIG) && stats.hits['/dead/f/a_2026-08.zim'] >= 1, 'failover de espejo');

  // 4) corte a mitad -> reanuda con Range
  mode = 'cut'; stats.cutOnce = true; stats.ranges = 0; dm = mk(); const d3 = path.join(tmp, 'resume', 'a.zim');
  dm.add({ id: 'r', urls: [B + '/m1/f/a_2026-08.zim'], sha256Urls: [B + '/m1/f/a_2026-08.zim.sha256'], dest: d3 });
  await wait(dm, () => dm.items.get('r').state === 'done');
  ok(fs.readFileSync(d3).equals(BIG) && stats.ranges >= 1, 'reanudación con Range tras un corte (rangos=' + stats.ranges + ')');

  // 5) hash incorrecto -> error y no se publica el archivo
  mode = 'badhash'; dm = mk({ retries: 1 }); const d4 = path.join(tmp, 'bad', 'a.zim');
  dm.add({ id: 'b', urls: [B + '/m1/f/a_2026-08.zim'], sha256Urls: [B + '/m1/f/a_2026-08.zim.sha256'], dest: d4 });
  await wait(dm, () => dm.items.get('b').state === 'error');
  ok(!fs.existsSync(d4) && /corrupto|SHA/.test(dm.items.get('b').error), 'hash distinto: error y sin archivo final');

  // 6) sin espacio
  mode = 'normal'; dm = mk({ minFreeBytes: 1000, freeSpace: () => 10 }); const d5 = path.join(tmp, 'space', 'a.zim');
  dm.add({ id: 's', urls: [B + '/m1/f/a_2026-08.zim'], dest: d5 });
  await wait(dm, () => dm.items.get('s').state === 'nospace');
  ok(!fs.existsSync(d5), 'espacio insuficiente: no descarga');

  // 7) pausa y reanudar (descarga lenta)
  mode = 'slow'; dm = mk(); const d6 = path.join(tmp, 'pause', 'a.zim');
  dm.add({ id: 'p', urls: [B + '/m1/f/a_2026-08.zim'], sha256Urls: [B + '/m1/f/a_2026-08.zim.sha256'], dest: d6 });
  await wait(dm, () => dm.items.get('p').done > 512 * 1024);
  dm.pause(); await wait(dm, () => dm.items.get('p').state === 'paused');
  const partial = fs.statSync(d6 + '.part').size; ok(partial > 0 && partial < BIG.length, 'pausa deja un .part parcial');
  dm.resume(); await wait(dm, () => dm.items.get('p').state === 'done');
  ok(fs.readFileSync(d6).equals(BIG), 'tras reanudar el archivo queda íntegro');

  // 8) cancelar
  mode = 'slow'; dm = mk(); const d7 = path.join(tmp, 'cancel', 'a.zim');
  dm.add({ id: 'c', urls: [B + '/m1/f/a_2026-08.zim'], dest: d7 });
  await wait(dm, () => dm.items.get('c').done > 256 * 1024);
  dm.cancel('c'); await wait(dm, () => dm.items.get('c').state === 'cancelled');
  ok(!fs.existsSync(d7) && !fs.existsSync(d7 + '.part'), 'cancelar borra el parcial');

  // 9) estado persistente
  mode = 'normal'; const sf = path.join(tmp, 'state.json'); dm = mk({ stateFile: sf, parallel: 1 });
  dm.paused = true; dm.add({ id: 'x', urls: [B + '/m1/f/a_2026-08.zim'], dest: path.join(tmp, 'persist', 'a.zim') });
  await new Promise(r => setTimeout(r, 600));
  const dm2 = mk({ stateFile: sf }); ok(dm2.loadState() === 1 && dm2.items.get('x').state === 'paused', 'estado guardado y recuperado tras reiniciar');

  console.log(`OK downloader: ${n} comprobaciones`);
  srv.close(); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(0);
})().catch(e => { console.error('FALLO:', e.message); srv.close(); process.exit(1); });
