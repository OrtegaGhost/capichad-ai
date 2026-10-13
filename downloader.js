// CapiChad - (c) 2026 Capibara Software (OrtegaGhost) - AGPL-3.0-or-later - https://github.com/OrtegaGhost/capichad-ai
// Aviso de autoria: conserva este encabezado y el archivo NOTICE en copias y derivados.
'use strict';
// CapiChad - motor de descargas (Capibara Software). Sin dependencias de Electron.
//
// Descarga archivos grandes (.zim de Kiwix, de 1 MB a 100 GB) de forma robusta:
//   - reanuda (HTTP Range) tras un corte o al reiniciar la app (estado en disco);
//   - varios espejos: si uno falla, prueba el siguiente;
//   - verifica SHA-256 (el archivo `<url>.sha256` de Kiwix) y solo entonces publica el archivo final;
//   - respeta el espacio libre (reserva mínima) y un límite de velocidad opcional;
//   - N descargas en paralelo, pausa/reanudar/cancelar.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const UA = 'CapiChad/1.x (+https://github.com/OrtegaGhost/capichad-ai)';

// ---------- listados de Kiwix ----------
function toBytes(s) {
  const m = /^([0-9.]+)([KMGT]?)$/.exec(String(s).trim()); if (!m) return 0;
  return Math.round(parseFloat(m[1]) * ({ '': 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 })[m[2]]);
}
// Apache autoindex: <a href="archivo.zim">archivo.zim</a>   2026-08-12 10:11  11G
function parseListing(html) {
  const out = []; const re = /<a href="([^"?\/]+\.zim)">[^<]*<\/a>\s+(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\s+([0-9.]+[KMGT]?)/g; let m;
  while ((m = re.exec(html))) out.push({ name: decodeURIComponent(m[1]), date: m[2], bytes: toBytes(m[3]) });
  return out;
}
// el archivo más reciente de un prefijo: <prefijo>_AAAA-MM[letra].zim
function latestFor(listing, prefix) {
  const re = new RegExp('^' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '_\\d{4}-\\d{2}[a-z]?\\.zim$');
  const hits = listing.filter(e => re.test(e.name)).sort((a, b) => (a.name < b.name ? 1 : -1));
  return hits[0] || null;
}

async function fetchText(fetchImpl, url, ms = 30000) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms);
  try { const r = await fetchImpl(url, { headers: { 'User-Agent': UA }, signal: ac.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.text(); }
  finally { clearTimeout(t); }
}

// Resuelve prefijos -> archivos concretos (con todas las URL de espejo). mirrors: ['https://…/zim/', …]
async function resolveItems(items, mirrors, fetchImpl = fetch, listingCache = new Map()) {
  const folders = [...new Set(items.map(i => i.folder))];
  await Promise.all(folders.map(async f => {
    if (listingCache.has(f)) return;
    let lst = null, err;
    for (const m of mirrors) { try { lst = parseListing(await fetchText(fetchImpl, m + f + '/')); if (lst.length) break; } catch (e) { err = e; } }
    if (!lst || !lst.length) throw new Error(`No se pudo leer el listado de «${f}»: ${err ? err.message : 'vacío'}`);
    listingCache.set(f, lst);
  }));
  const out = [], missing = [];
  for (const it of items) {
    const hit = latestFor(listingCache.get(it.folder) || [], it.prefix);
    if (!hit) { missing.push(it.prefix); continue; }
    out.push({ prefix: it.prefix, folder: it.folder, name: hit.name, bytes: hit.bytes,
      urls: mirrors.map(m => `${m}${it.folder}/${hit.name}`), sha256Urls: mirrors.map(m => `${m}${it.folder}/${hit.name}.sha256`) });
  }
  return { files: out, missing };
}

// ---------- hash ----------
function sha256File(file, onProgress, signal) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256'); const s = fs.createReadStream(file, { highWaterMark: 4 * 1024 * 1024 }); let n = 0;
    s.on('data', d => { h.update(d); n += d.length; if (onProgress) onProgress(n); if (signal && signal.aborted) { s.destroy(); reject(new Error('cancelado')); } });
    s.on('error', reject); s.on('end', () => resolve(h.digest('hex')));
  });
}

function freeSpaceOf(dir) {
  try { const s = fs.statfsSync(dir); return Number(s.bavail) * Number(s.bsize); } catch { return Infinity; }
}

// ---------- gestor ----------
class DownloadManager extends EventEmitter {
  /**
   * @param {object} o  { parallel, maxBps, minFreeBytes, fetch, stateFile, freeSpace, retries, backoffMs }
   */
  constructor(o = {}) {
    super();
    this.parallel = o.parallel || 2; this.maxBps = o.maxBps || 0; this.minFree = o.minFreeBytes ?? 25 * 1024 ** 3;
    this.fetch = o.fetch || fetch; this.stateFile = o.stateFile || null; this.freeSpace = o.freeSpace || freeSpaceOf;
    this.retries = o.retries ?? 6; this.backoff = o.backoffMs ?? 2000;
    this.items = new Map(); this.active = new Map(); this.paused = false; this._saveT = null;
  }
  // item: { id, urls:[…], dest, sha256Urls?:[…], bytes? }
  add(item) {
    const prev = this.items.get(item.id);
    if (prev && prev.state === 'done') return prev;
    const it = { id: item.id, urls: item.urls.slice(), sha256Urls: (item.sha256Urls || []).slice(), dest: item.dest, bytes: item.bytes || 0,
      done: 0, state: 'queued', error: '', bps: 0, tries: 0, title: item.title || path.basename(item.dest), group: item.group || '' };
    this.items.set(it.id, it); this._save(); this._pump(); return it;
  }
  addMany(list) { list.forEach(i => this.add(i)); }
  pause() { this.paused = true; for (const [, a] of this.active) a.ac.abort(); this._emitAll(); }
  resume() { this.paused = false; for (const it of this.items.values()) if (it.state === 'paused') it.state = 'queued'; this._pump(); }
  cancel(id) { const a = this.active.get(id); if (a) { a.cancelled = true; a.ac.abort(); } const it = this.items.get(id); if (it && it.state !== 'done') { it.state = 'cancelled'; this._rm(it.dest + '.part'); this._emit(it); } this._save(); }
  retry(id) { const it = this.items.get(id); if (it && ['error', 'cancelled', 'nospace'].includes(it.state)) { it.state = 'queued'; it.error = ''; it.tries = 0; this._pump(); } }
  snapshot() {
    const list = [...this.items.values()].map(i => ({ ...i }));
    const total = list.reduce((s, i) => s + (i.bytes || 0), 0), done = list.reduce((s, i) => s + (i.state === 'done' ? (i.bytes || i.done) : i.done), 0);
    return { items: list, total, done, bps: list.reduce((s, i) => s + (i.state === 'downloading' ? i.bps : 0), 0),
      pending: list.filter(i => !['done', 'cancelled'].includes(i.state)).length };
  }
  loadState() {
    if (!this.stateFile) return 0; let n = 0;
    try { for (const i of JSON.parse(fs.readFileSync(this.stateFile, 'utf8')).items || []) { if (!this.items.has(i.id) && !fs.existsSync(i.dest)) { this.items.set(i.id, { ...i, state: 'paused', bps: 0, error: '' }); n++; } } } catch {}
    return n;
  }
  _save() {
    if (!this.stateFile || this._saveT) return;
    this._saveT = setTimeout(() => { this._saveT = null; try { fs.mkdirSync(path.dirname(this.stateFile), { recursive: true });
      fs.writeFileSync(this.stateFile, JSON.stringify({ items: [...this.items.values()].filter(i => !['done', 'cancelled'].includes(i.state)).map(i => ({ id: i.id, urls: i.urls, sha256Urls: i.sha256Urls, dest: i.dest, bytes: i.bytes, title: i.title, group: i.group })) })); } catch {} }, 400);
  }
  _rm(f) { try { fs.unlinkSync(f); } catch {} }
  _emit(it) { this.emit('item', { id: it.id, state: it.state, done: it.done, bytes: it.bytes, bps: it.bps, error: it.error, title: it.title, group: it.group }); }
  _emitAll() { for (const it of this.items.values()) this._emit(it); }
  _pump() {
    if (this.paused) return;
    for (const it of this.items.values()) {
      if (this.active.size >= this.parallel) break;
      if (it.state !== 'queued' || this.active.has(it.id)) continue;
      this._run(it).catch(() => {});
    }
    if (!this.active.size && ![...this.items.values()].some(i => i.state === 'queued')) this.emit('idle', this.snapshot());
  }
  async _run(it) {
    const ctl = { ac: new AbortController(), cancelled: false }; this.active.set(it.id, ctl);
    try {
      if (fs.existsSync(it.dest)) { it.state = 'done'; it.done = it.bytes = fs.statSync(it.dest).size; this._emit(it); return; }
      fs.mkdirSync(path.dirname(it.dest), { recursive: true });
      while (it.tries <= this.retries) {
        if (ctl.ac.signal.aborted) break;
        const url = it.urls[it.tries % it.urls.length];
        try {
          it.state = 'downloading'; it.error = ''; this._emit(it);
          await this._transfer(it, url, ctl);
          it.state = 'verifying'; this._emit(it);
          await this._verify(it, ctl);
          fs.renameSync(it.dest + '.part', it.dest);
          it.state = 'done'; it.done = it.bytes = fs.statSync(it.dest).size; it.bps = 0; this._emit(it); return;
        } catch (e) {
          if (ctl.cancelled) { it.state = 'cancelled'; this._emit(it); return; }
          if (this.paused || ctl.ac.signal.aborted) { it.state = 'paused'; it.bps = 0; this._emit(it); return; }
          if (e.code === 'NOSPACE') { it.state = 'nospace'; it.error = e.message; this._emit(it); return; }
          if (e.code === 'BADHASH') { this._rm(it.dest + '.part'); it.done = 0; }
          it.tries++; it.error = e.message;
          if (it.tries > this.retries) { it.state = 'error'; this._emit(it); return; }
          this._emit(it); await sleep(Math.min(30000, this.backoff * 2 ** (it.tries - 1)));
        }
      }
    } finally { this.active.delete(it.id); this._save(); setImmediate(() => this._pump()); }
  }
  async _transfer(it, url, ctl) {
    const part = it.dest + '.part';
    let have = 0; try { have = fs.statSync(part).size; } catch {}
    const headers = { 'User-Agent': UA }; if (have > 0) headers.Range = `bytes=${have}-`;
    const res = await this.fetch(url, { headers, signal: ctl.ac.signal });
    if (res.status === 416) { // ya estaba completo
      it.done = have; return;
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    let total = it.bytes;
    if (res.status === 206) { const m = /\/(\d+)$/.exec(res.headers.get('content-range') || ''); if (m) total = +m[1]; }
    else { have = 0; const len = +res.headers.get('content-length') || 0; if (len) total = len; }   // el servidor ignoró Range: empezar de cero
    if (total) it.bytes = total;
    const need = Math.max(0, (total || 0) - have);
    if (this.freeSpace(path.dirname(it.dest)) - need < this.minFree) { const e = new Error('Espacio insuficiente en el disco'); e.code = 'NOSPACE'; throw e; }
    const ws = fs.createWriteStream(part, { flags: have > 0 ? 'a' : 'w' }); let done = have; let t0 = Date.now(), n0 = have, lastEmit = 0;
    try {
      for await (const chunk of res.body) {
        if (!ws.write(chunk)) await new Promise(r => ws.once('drain', r));
        done += chunk.length; it.done = done;
        const now = Date.now();
        if (now - t0 >= 1000) { it.bps = Math.round((done - n0) * 1000 / (now - t0)); t0 = now; n0 = done; }
        if (now - lastEmit > 250) { lastEmit = now; this._emit(it); }
        if (this.maxBps) { const per = this.parallel || 1; const wait = (chunk.length * 1000) / (this.maxBps / per); if (wait > 2) await sleep(wait); }
      }
    } finally { await new Promise(r => ws.end(r)); }
    if (total && done < total) throw new Error(`Descarga incompleta (${done} de ${total} bytes)`);
    it.done = done;
  }
  async _verify(it, ctl) {
    let expected = null;
    for (const u of it.sha256Urls) {
      try { const t = await fetchText(this.fetch, u, 20000); const m = /\b([a-f0-9]{64})\b/i.exec(t); if (m) { expected = m[1].toLowerCase(); break; } } catch {}
    }
    if (!expected) return;       // sin .sha256 publicado: se acepta por tamaño
    const got = await sha256File(it.dest + '.part', n => { it.done = n; }, ctl.ac.signal);
    if (got !== expected) { const e = new Error('El archivo descargado está corrupto (SHA-256 distinto); se descargará de nuevo'); e.code = 'BADHASH'; throw e; }
  }
}

module.exports = { DownloadManager, parseListing, latestFor, resolveItems, sha256File, toBytes, freeSpaceOf };
