// CapiChad - (c) 2026 Capibara Software (OrtegaGhost) - AGPL-3.0-or-later - https://github.com/OrtegaGhost/capichad-ai
// Aviso de autoria: conserva este encabezado y el archivo NOTICE en copias y derivados.
// CapiChad - proceso principal (Capibara Software)
const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile, spawn } = require('child_process');
const PROG = require('./prog.js');
const _bk = ['513b13c2', '3f246db3', 'cd7fa61c', '0f335fd6', '8cef536a', '197c7aeb', '12b6fb1b', 'b119b79a'].join('');   // build key
const PLAN = require('./plan.js');
const INSTALLER = require('./installer.js');
const { DownloadManager } = require('./downloader.js');

let OLLAMA = 'http://127.0.0.1:11434';      // se puede apuntar a otro equipo de la red (cfg.ollamaHost)
const isRemoteOllama = () => !/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/i.test(OLLAMA);
function applyOllamaHost(h) {
  const t = String(h || '').trim();
  if (!t) { OLLAMA = 'http://127.0.0.1:11434'; return OLLAMA; }
  const u = /^https?:\/\//i.test(t) ? t : 'http://' + t;
  OLLAMA = (/:\d+(\/|$)/.test(u.replace(/^https?:\/\//i, '')) ? u : u.replace(/\/$/, '') + ':11434').replace(/\/$/, '');
  return OLLAMA;
}
const DEFAULTS = {
  theme: 'dark', textSize: 'normal', language: 'es', saveHistory: true,
  defaultModel: '', autoCheck: false, embedModel: 'nomic-embed-text', numCtx: 8192, dataDir: '', setupDone: false, useKnowledge: true, delegation: true, think: false, webMode: 'auto', kbDb: '', kbFolders: []
};

let win = null;
let cfg = { ...DEFAULTS };
const cfgFile = () => path.join(app.getPath('userData'), 'config.json');
function loadCfg() {
  // migración desde el nombre anterior de la app ("IA Local")
  try { const old = path.join(app.getPath('appData'), 'IA Local', 'config.json'); if (!fs.existsSync(cfgFile()) && fs.existsSync(old)) { fs.mkdirSync(path.dirname(cfgFile()), { recursive: true }); fs.copyFileSync(old, cfgFile()); } } catch {}
  try { cfg = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(cfgFile(), 'utf8')) }; } catch { cfg = { ...DEFAULTS }; }
  const docs = app.getPath('documents'), oldDef = path.join(docs, 'IA Local'), newDef = path.join(docs, 'CapiChad');
  if (!cfg.dataDir || cfg.dataDir === oldDef) {
    if (fs.existsSync(oldDef) && !fs.existsSync(newDef)) { try { fs.renameSync(oldDef, newDef); } catch {} }
    cfg.dataDir = (fs.existsSync(newDef) || !fs.existsSync(oldDef)) ? newDef : oldDef; saveCfg();
  }
}
function applyCfgHost() { applyOllamaHost(cfg.ollamaHost); }
function saveCfg() { try { fs.mkdirSync(path.dirname(cfgFile()), { recursive: true }); fs.writeFileSync(cfgFile(), JSON.stringify(cfg, null, 2)); } catch {} }

// ---------- almacenamiento ----------
const D = (...p) => path.join(cfg.dataDir, ...p);
function ensureDirs() { for (const d of ['chats', 'docs/files', 'docs/chunks']) fs.mkdirSync(D(d), { recursive: true }); }
const readJson = (f, def) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return def; } };
const writeJson = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o)); };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const safe = s => String(s).replace(/[^a-zA-Z0-9_-]/g, '');

// ---------- Ollama ----------
function ollamaExe() {
  const c = [path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe'), 'C:\\Program Files\\Ollama\\ollama.exe'];
  for (const p of c) if (fs.existsSync(p)) return p;
  for (const d of (process.env.PATH || '').split(';')) { const p = path.join(d, 'ollama.exe'); if (d && fs.existsSync(p)) return p; }
  return null;
}
async function ping(ms = 1500) {
  try { const r = await fetch(OLLAMA + '/api/version', { signal: AbortSignal.timeout(ms) }); return r.ok; } catch { return false; }
}
async function ensureServer() {
  if (await ping()) return true;
  if (isRemoteOllama()) return false;        // servidor remoto: no hay nada que arrancar aquí
  const exe = ollamaExe(); if (!exe) return false;
  try { spawn(exe, ['serve'], { detached: true, stdio: 'ignore', windowsHide: true }).unref(); } catch { return false; }
  for (let i = 0; i < 20; i++) { await new Promise(r => setTimeout(r, 500)); if (await ping()) return true; }
  return false;
}
async function oget(p) { const r = await fetch(OLLAMA + p); if (!r.ok) throw new Error(await r.text()); return r.json(); }
let titleAC = null;                       // título en curso: se cancela si el usuario envía otro mensaje
const thinkCache = new Map();
async function modelThinks(model) {
  if (thinkCache.has(model)) return thinkCache.get(model);
  let v = true;                           // ante la duda se asume que razona (no se pide título al modelo)
  try { v = ((await opost('/api/show', { model })).capabilities || []).includes('thinking'); } catch {}
  thinkCache.set(model, v); return v;
}
async function opost(p, body) {
  const r = await fetch(OLLAMA + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(await r.text()); return r.json();
}
async function* ostream(p, body, signal) {
  const r = await fetch(OLLAMA + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  if (!r.ok) throw new Error((await r.text()) || r.status);
  const dec = new TextDecoder(); let buf = '';
  for await (const chunk of r.body) {
    buf += dec.decode(chunk, { stream: true });
    let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (l) yield JSON.parse(l); }
  }
}
const send = (ch, data) => { if (win && !win.isDestroyed()) win.webContents.send(ch, data); };

// ---------- rendimiento ----------
let cpuPct = 0, corePct = [], lastCpu = os.cpus().map(c => ({ ...c.times }));
setInterval(() => {
  const now = os.cpus().map(c => ({ ...c.times })); let idle = 0, tot = 0; const per = [];
  now.forEach((c, i) => { const p = lastCpu[i]; if (!p) return; const d = k => c[k] - p[k]; const t = d('user') + d('nice') + d('sys') + d('idle') + d('irq'); tot += t; idle += d('idle'); per.push(t ? Math.round(100 * (1 - d('idle') / t)) : 0); });
  cpuPct = tot ? Math.round(100 * (1 - idle / tot)) : 0; corePct = per; lastCpu = now;
}, 2000);
const GPU_FIELDS = ['name', 'driver_version', 'utilization.gpu', 'utilization.memory', 'memory.used', 'memory.total', 'temperature.gpu', 'power.draw', 'power.limit', 'clocks.gr', 'clocks.max.gr', 'clocks.mem', 'clocks.max.mem', 'pcie.link.gen.current', 'pcie.link.width.current', 'fan.speed', 'pstate'];
function gpuInfo() {
  return new Promise(res => {
    execFile('nvidia-smi', ['--query-gpu=' + GPU_FIELDS.join(','), '--format=csv,noheader,nounits'], { timeout: 3000, windowsHide: true }, (e, out) => {
      if (e || !out) return res(null);
      const v = out.trim().split('\n')[0].split(',').map(s => s.trim()); const n = i => { const x = parseFloat(v[i]); return isNaN(x) ? null : x; };
      res({ name: v[0], driver: v[1], util: n(2) ?? 0, memUtil: n(3), vramUsed: (n(4) || 0) / 1024, vramTotal: (n(5) || 0) / 1024, temp: n(6), power: n(7), powerLimit: n(8), clock: n(9), clockMax: n(10), memClock: n(11), memClockMax: n(12), pcieGen: n(13), pcieWidth: n(14), fan: n(15), pstate: v[16] });
    });
  });
}
function diskFree() { try { const s = fs.statfsSync(cfg.dataDir.slice(0, 3)); return s.bavail * s.bsize; } catch { return 0; } }

// ---------- hardware detallado (PowerShell / WMI) ----------
function psJson(script, timeout = 20000) {
  return new Promise(res => {
    const enc = Buffer.from('$ErrorActionPreference="SilentlyContinue";[Console]::OutputEncoding=[Text.Encoding]::UTF8;' + script, 'utf16le').toString('base64');
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', enc], { timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (e, out) => { try { res(JSON.parse(out)); } catch { res(null); } });
  });
}
const arr = x => x == null ? [] : Array.isArray(x) ? x : [x];
const MEMTYPE = { 20: 'DDR', 21: 'DDR2', 24: 'DDR3', 26: 'DDR4', 27: 'LPDDR', 28: 'LPDDR2', 29: 'LPDDR3', 30: 'LPDDR4', 34: 'DDR5', 35: 'LPDDR5' };
const FORMF = { 8: 'DIMM', 12: 'SODIMM', 13: 'SRIMM', 11: 'RIMM' };
let hwCache = null;
async function hardware() {
  if (hwCache) return hwCache;
  const r = await psJson(`
$mem=@(Get-CimInstance Win32_PhysicalMemory|%{[pscustomobject]@{cap=$_.Capacity;speed=$_.Speed;conf=$_.ConfiguredClockSpeed;type=$_.SMBIOSMemoryType;ff=$_.FormFactor;mfr=("$($_.Manufacturer)").Trim();pn=("$($_.PartNumber)").Trim();slot=$_.DeviceLocator;volt=$_.ConfiguredVoltage}})
$ma=Get-CimInstance Win32_PhysicalMemoryArray|select -First 1
$cpu=Get-CimInstance Win32_Processor|select -First 1
$gp=@(Get-CimInstance Win32_VideoController|%{[pscustomobject]@{name=$_.Name;driver=$_.DriverVersion;date="$($_.DriverDate)";ram=$_.AdapterRAM;res="$($_.CurrentHorizontalResolution)x$($_.CurrentVerticalResolution)";hz=$_.CurrentRefreshRate}})
$bios=Get-CimInstance Win32_ComputerSystem|select Manufacturer,Model
[pscustomobject]@{mem=$mem;slots=$ma.MemoryDevices;maxcap=$ma.MaxCapacity;cpu=[pscustomobject]@{name=$cpu.Name;mfr=$cpu.Manufacturer;cores=$cpu.NumberOfCores;threads=$cpu.NumberOfLogicalProcessors;max=$cpu.MaxClockSpeed;l2=$cpu.L2CacheSize;l3=$cpu.L3CacheSize;socket=$cpu.SocketDesignation;arch=$cpu.Architecture;virt=$cpu.VirtualizationFirmwareEnabled;desc=$cpu.Description};gpus=$gp;pc=$bios}|ConvertTo-Json -Depth 5 -Compress`, 30000);
  if (!r) return null;
  const mods = arr(r.mem).map(m => { const sp = m.speed || 0, cf = m.conf || sp; let type = MEMTYPE[m.type] || (sp >= 4000 ? 'DDR5' : sp ? 'DDR4' : '—');
    return { cap: m.cap, speed: sp, conf: cf, type, ff: FORMF[m.ff] || '—', mfr: /^(0000|unknown|undefined)/i.test(m.mfr) ? '' : m.mfr, pn: m.pn, slot: m.slot, volt: m.volt ? m.volt / 1000 : null }; });
  const c = r.cpu || {};
  hwCache = { ram: { modules: mods, slots: r.slots || mods.length, maxCap: (r.maxcap || 0) * 1024 }, cpu: { name: (c.name || '').replace(/\s+/g, ' ').trim(), mfr: c.mfr, cores: c.cores, threads: c.threads, maxMHz: c.max, l2: c.l2, l3: c.l3, socket: c.socket, arch: ({ 9: 'x64', 0: 'x86', 12: 'ARM64' })[c.arch] || '—', virt: c.virt, desc: c.desc },
    gpus: arr(r.gpus), pc: r.pc }; return hwCache;
}
// frecuencia real del procesador (sonda ligera en segundo plano)
let probe = null, probeLast = null, probeUsed = 0;
function ensureProbe() {
  probeUsed = Date.now(); if (probe) return;
  const script = 'while($true){$p=Get-CimInstance Win32_PerfFormattedData_Counters_ProcessorInformation|?{$_.Name -eq "_Total"}|select -First 1;if($p){Write-Output ("{0}|{1}" -f $p.ProcessorFrequency,$p.PercentProcessorPerformance)};Start-Sleep -Seconds 3}';
  probe = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true });
  probe.stdout.on('data', d => { const l = d.toString().trim().split(/\r?\n/).pop().split('|'); const f = parseFloat(l[0]), pr = parseFloat(l[1]); if (!isNaN(f)) probeLast = { mhz: isNaN(pr) ? f : f * pr / 100, perf: isNaN(pr) ? null : pr }; });
  probe.on('close', () => { probe = null; });
}
setInterval(() => { if (probe && Date.now() - probeUsed > 20000) { probe.kill(); probe = null; } }, 10000);
app.on('before-quit', () => { try { probe && probe.kill(); } catch {} });

// ---------- almacenamiento ----------
async function dirSize(dir, depth = 0) {
  let total = 0; let ents; try { ents = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return 0; }
  for (const e of ents) { const p = path.join(dir, e.name); try { if (e.isDirectory()) total += await dirSize(p, depth + 1); else if (e.isFile()) total += (await fs.promises.stat(p)).size; } catch {} }
  return total;
}
const modelsDir = () => process.env.OLLAMA_MODELS || path.join(os.homedir(), '.ollama', 'models');
const sameDir = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
let sizeCache = { t: 0, v: null };
async function storage() {
  const r = await psJson(`
$d=@(Get-PhysicalDisk|%{[pscustomobject]@{id="$($_.DeviceId)";name=$_.FriendlyName;media="$($_.MediaType)";bus="$($_.BusType)";size=$_.Size;health="$($_.HealthStatus)"}})
$p=@(Get-Partition|?{$_.DriveLetter}|%{[pscustomobject]@{disk="$($_.DiskNumber)";l="$($_.DriveLetter)"}})
$v=@(Get-Volume|?{$_.DriveLetter}|%{[pscustomobject]@{l="$($_.DriveLetter)";label=$_.FileSystemLabel;fs=$_.FileSystem;size=$_.Size;free=$_.SizeRemaining;type="$($_.DriveType)"}})
[pscustomobject]@{d=$d;p=$p;v=$v}|ConvertTo-Json -Depth 4 -Compress`, 20000);
  const disks = arr(r?.d).map(d => ({ ...d, volumes: [] })); const vols = arr(r?.v), parts = arr(r?.p);
  vols.forEach(v => { const pt = parts.find(p => p.l === v.l); const d = disks.find(x => x.id === (pt && pt.disk)) || null; const o = { letter: v.l, label: v.label, fs: v.fs, size: v.size, free: v.free, used: v.size - v.free, type: v.type }; if (d) d.volumes.push(o); else (disks.find(x => x.id === '_other') || (disks.push({ id: '_other', name: 'Otras unidades', media: '', bus: '', size: 0, volumes: [] }), disks[disks.length - 1])).volumes.push(o); });
  if (Date.now() - sizeCache.t > 30000 || !sizeCache.v) {
    const appDir = app.isPackaged ? path.dirname(process.execPath) : __dirname, mDir = modelsDir();
    const [a, m, dd] = await Promise.all([dirSize(appDir), dirSize(mDir), dirSize(cfg.dataDir)]);
    sizeCache = { t: Date.now(), v: { app: { path: appDir, size: a }, models: { path: mDir, size: m }, data: { path: cfg.dataDir, size: dd } } };
  }
  const sysLetter = (process.env.SystemDrive || 'C:').slice(0, 1).toUpperCase();
  const all = disks.flatMap(d => d.volumes); const tot = all.reduce((s, v) => s + (v.size || 0), 0), fr = all.reduce((s, v) => s + (v.free || 0), 0);
  return { disks, sysLetter, totalSize: disks.reduce((s, d) => s + (d.size || 0), 0) || tot, volTotal: tot, free: fr, used: tot - fr, mine: sizeCache.v, mineTotal: sizeCache.v.app.size + sizeCache.v.models.size + sizeCache.v.data.size };
}
async function moveModels(dest) {
  const from = modelsDir(); if (sameDir(from, dest)) throw new Error('Esa ya es la carpeta de modelos actual.');
  if (sameDir(dest, os.homedir()) || path.resolve(dest).toLowerCase().startsWith(path.resolve(from).toLowerCase() + path.sep)) throw new Error('Elige una carpeta distinta, fuera de la actual.');
  const need = await dirSize(from); fs.mkdirSync(dest, { recursive: true });
  try { const s = fs.statfsSync(path.parse(path.resolve(dest)).root); if (s.bavail * s.bsize < need * 1.05 + 5e8) throw new Error(`No hay espacio suficiente en esa unidad (necesitas ${(need / 1e9).toFixed(1)} GB).`); } catch (e) { if (/espacio/.test(e.message)) throw e; }
  if (!process.env.IA_TEST_MOVE) await killOllama();
  const tm = setInterval(async () => send('move:progress', { done: await dirSize(dest), total: need }), 1500);
  try { await fs.promises.cp(from, dest, { recursive: true, force: true }); } finally { clearInterval(tm); }
  if (!process.env.IA_TEST_MOVE) await new Promise(r => execFile('setx', ['OLLAMA_MODELS', dest], { windowsHide: true }, () => r()));
  process.env.OLLAMA_MODELS = dest; sizeCache.t = 0;
  const ok = process.env.IA_TEST_MOVE ? true : await ensureServer(); if (!ok) throw new Error('Se copiaron los modelos pero Ollama no arrancó. Reinicia el equipo e inténtalo de nuevo.');
  return { from, to: dest };
}
async function killOllama() {
  await new Promise(r => execFile('taskkill', ['/F', '/IM', 'ollama.exe'], { windowsHide: true }, () => r()));
  await new Promise(r => execFile('taskkill', ['/F', '/IM', 'ollama app.exe'], { windowsHide: true }, () => r()));
  await new Promise(r => setTimeout(r, 1500));
}

// ---------- documentos / RAG ----------
const STOP = new Set('de la el en y a los las del se que un una por con para es al lo como mas pero sus le ya o este si porque esta entre cuando muy sin sobre tambien me hasta hay donde quien desde todo nos durante todos uno les ni contra otros ese eso ante ellos e esto mi antes algunos que unos yo otro otras otra el tanto esa estos mucho quienes nada muchos cual poco ella estar estas algunas algo nosotros the of and to in is that it for on with as are this be by or an'.split(' '));
const tok = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter(w => w.length > 1 && !STOP.has(w));
const docsIndex = () => readJson(D('docs', 'index.json'), []);
const saveDocsIndex = l => writeJson(D('docs', 'index.json'), l);
const chunkCache = new Map();
function loadChunks(id) { if (!chunkCache.has(id)) chunkCache.set(id, readJson(D('docs', 'chunks', safe(id) + '.json'), [])); return chunkCache.get(id); }

function splitPage(text, size = 900, over = 150) {
  text = text.replace(/\s+/g, ' ').trim(); const out = [];
  for (let i = 0; i < text.length; i += size - over) { out.push(text.slice(i, i + size)); if (i + size >= text.length) break; }
  return out;
}
async function extract(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.pdf') {
    const pdfjs = require('pdfjs-dist/legacy/build/pdf.js'); const pages = [];
    const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), useSystemFonts: true, disableFontFace: true, verbosity: 0 }).promise;
    for (let i = 1; i <= doc.numPages; i++) { const pg = await doc.getPage(i); const tc = await pg.getTextContent(); pages.push(tc.items.map(x => x.str).join(' ')); }
    return { pages, type: 'pdf' };
  }
  if (ext === '.docx') { const m = require('mammoth'); const r = await m.extractRawText({ path: file }); return { pages: [r.value], type: 'docx' }; }
  return { pages: [fs.readFileSync(file, 'utf8')], type: 'texto' };
}
async function embedAvailable() {
  try { const t = await oget('/api/tags'); return t.models.some(m => m.name.split(':')[0] === cfg.embedModel.split(':')[0]); } catch { return false; }
}
async function embedTexts(arr) { const r = await opost('/api/embed', { model: cfg.embedModel, input: arr, keep_alive: '2m' }); return r.embeddings; }

async function addDocument(file) {
  const id = uid(), name = path.basename(file);
  fs.copyFileSync(file, D('docs', 'files', id + path.extname(file)));
  const idx = docsIndex(); const rec = { id, name, ext: path.extname(file).toLowerCase(), size: fs.statSync(file).size, addedAt: Date.now(), status: 'indexando', pages: 0, chunks: 0, embedded: false };
  idx.unshift(rec); saveDocsIndex(idx); send('docs:update', rec);
  try {
    const { pages } = await extract(file); const chunks = [];
    pages.forEach((t, i) => splitPage(t).forEach(c => chunks.push({ p: i + 1, t: c })));
    rec.pages = pages.length; rec.chunks = chunks.length;
    if (!chunks.length) throw new Error('No se encontró texto en el archivo (¿PDF escaneado?)');
    if (await ensureServer() && await embedAvailable()) {
      try { for (let i = 0; i < chunks.length; i += 16) { const v = await embedTexts(chunks.slice(i, i + 16).map(c => c.t)); v.forEach((e, j) => chunks[i + j].v = e.map(x => Math.round(x * 1e4) / 1e4)); rec.progress = Math.round(100 * i / chunks.length); send('docs:update', rec); } rec.embedded = true; } catch { chunks.forEach(c => delete c.v); }
    }
    writeJson(D('docs', 'chunks', id + '.json'), chunks); chunkCache.set(id, chunks);
    rec.status = 'listo';
  } catch (e) { rec.status = 'error'; rec.error = e.message; }
  delete rec.progress; saveDocsIndex(docsIndex().map(d => d.id === id ? rec : d)); send('docs:update', rec); return rec;
}

async function searchDocs(query, ids, k = 5) {
  const idx = docsIndex().filter(d => d.status === 'listo' && (!ids || !ids.length || ids.includes(d.id)));
  const all = []; idx.forEach(d => loadChunks(d.id).forEach((c, i) => all.push({ doc: d.id, name: d.name, ext: d.ext, p: c.p, t: c.t, v: c.v, key: d.id + ':' + i })));
  if (!all.length) return [];
  // BM25
  const q = tok(query); const N = all.length, df = {}; const toks = all.map(c => { const t = tok(c.t); new Set(t).forEach(w => df[w] = (df[w] || 0) + 1); return t; });
  const avg = toks.reduce((s, t) => s + t.length, 0) / N || 1;
  const bm = all.map((c, i) => { const tf = {}; toks[i].forEach(w => tf[w] = (tf[w] || 0) + 1); let s = 0;
    q.forEach(w => { if (!tf[w]) return; const idf = Math.log(1 + (N - df[w] + 0.5) / (df[w] + 0.5)); s += idf * tf[w] * 2.5 / (tf[w] + 1.5 * (0.25 + 0.75 * toks[i].length / avg)); }); return s; });
  const rank = arr => { const o = arr.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0]); const r = new Array(arr.length); o.forEach(([, i], pos) => r[i] = pos); return r; };
  let score = bm.map(s => s);
  const hasVec = all.some(c => c.v);
  if (hasVec && await embedAvailable()) {
    try {
      const [qv] = await embedTexts([query]);
      const cos = all.map(c => { if (!c.v) return 0; let d = 0, a = 0, b = 0; for (let i = 0; i < qv.length; i++) { d += qv[i] * c.v[i]; a += qv[i] ** 2; b += c.v[i] ** 2; } return d / (Math.sqrt(a * b) || 1); });
      const r1 = rank(bm), r2 = rank(cos); score = all.map((_, i) => (bm[i] > 0 ? 1 / (60 + r1[i]) : 0) + 1 / (60 + r2[i]));
    } catch {}
  }
  return all.map((c, i) => ({ c, s: score[i] })).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, k)
    .map(({ c }) => ({ doc: c.doc, name: c.name, ext: c.ext, page: c.p, text: c.t }));
}


// ---------- conocimiento: libros indexados (SQLite FTS5 vía helper Python) ----------
// Carpeta del sistema de biblioteca (biblioteca\, datos\, herramientas\): la variable CAPICHAD_HOME, la instalación
// antigua en Program Files (si ya tiene datos) o, por defecto, %LOCALAPPDATA%\CapiChad (no requiere administrador).
const KB_HOME = (process.env.CAPICHAD_HOME || (fs.existsSync('C:/Program Files (x86)/CapiChad/datos') ? 'C:/Program Files (x86)/CapiChad' : path.join(process.env.LOCALAPPDATA || os.homedir(), 'CapiChad'))).replace(/\\/g, '/');
const kbDb = () => cfg.kbDb || path.join(KB_HOME, 'datos', 'conocimiento.db');
function kbScript() {
  const c = [path.join(KB_HOME, 'herramientas', 'capichad_kb.py'), path.join(__dirname, 'tools', 'capichad_kb.py'), process.resourcesPath && path.join(process.resourcesPath, 'tools', 'capichad_kb.py')].filter(Boolean);
  return c.find(p => fs.existsSync(p)) || null;
}
const pyEnv = { ...process.env, PYTHONIOENCODING: 'utf-8', CAPICHAD_HOME: KB_HOME };
// Python embebido (viaja con la app: no hace falta tener Python instalado); si no está, el del sistema
function pyExe() {
  const c = [process.resourcesPath && path.join(process.resourcesPath, 'tools', 'python', 'python.exe'), path.join(__dirname, 'tools', 'python', 'python.exe')].filter(Boolean);
  return c.find(p => fs.existsSync(p)) || 'python';
}
// carpeta de una herramienta: primero la del equipo (herramientas), luego la empaquetada con la app
function toolPath(...rel) {
  const c = [path.join(KB_HOME, 'herramientas', ...rel), path.join(__dirname, 'tools', ...rel), process.resourcesPath && path.join(process.resourcesPath, 'tools', ...rel)].filter(Boolean);
  return c.find(p => fs.existsSync(p)) || null;
}
let kbProc = null, kbBuf = '', kbSeq = 0; const kbWait = new Map();
function kbStart() {
  if (kbProc) return true; const sc = kbScript(); if (!sc) return false;
  try { fs.mkdirSync(path.dirname(kbDb()), { recursive: true }); fs.mkdirSync(path.join(KB_HOME, 'biblioteca'), { recursive: true }); } catch { return false; }   // la base se crea vacía en el primer uso
  kbProc = spawn(pyExe(), [sc, 'serve', '--db', kbDb()], { windowsHide: true, env: pyEnv });
  kbProc.stdout.setEncoding('utf8');
  kbProc.stdout.on('data', d => { kbBuf += d; let i; while ((i = kbBuf.indexOf('\n')) >= 0) { const l = kbBuf.slice(0, i).trim(); kbBuf = kbBuf.slice(i + 1); if (!l) continue; try { const m = JSON.parse(l); const w = kbWait.get(m.id); if (w) { kbWait.delete(m.id); m.error ? w.rej(new Error(m.error)) : w.res(m.ok); } } catch {} } });
  kbProc.on('error', () => { kbProc = null; }); kbProc.on('close', () => { kbProc = null; kbWait.forEach(w => w.rej(new Error('El motor de biblioteca se cerró'))); kbWait.clear(); });
  return true;
}
function kb(op, args = {}, ms = 25000) {
  if (!kbStart()) return Promise.resolve(null);
  return new Promise((res, rej) => { const id = ++kbSeq; const t = setTimeout(() => { kbWait.delete(id); rej(new Error('La biblioteca tardó demasiado')); }, ms); kbWait.set(id, { res: v => { clearTimeout(t); res(v); }, rej: e => { clearTimeout(t); rej(e); } }); kbProc.stdin.write(JSON.stringify({ id, op, ...args }) + '\n'); });
}
let kbIngest = null;
function kbRunIngest(folder) {
  if (kbIngest) throw new Error('Ya se está indexando una carpeta.'); const sc = kbScript(); if (!sc) throw new Error('No se encontró el motor de biblioteca (capichad_kb.py).');
  fs.mkdirSync(path.dirname(kbDb()), { recursive: true });
  return new Promise((res, rej) => {
    const p = spawn(pyExe(), [sc, 'ingest', folder, '--db', kbDb()], { windowsHide: true, env: pyEnv }); kbIngest = p; let last = null, err = '', buf = '';
    p.stdout.setEncoding('utf8'); p.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); try { last = JSON.parse(l); if (last.n) send('kb:progress', last); } catch {} } });
    p.stderr.on('data', d => err += d);
    p.on('error', e => { kbIngest = null; rej(new Error('No se pudo ejecutar Python: ' + e.message)); });
    p.on('close', c => { kbIngest = null; if (kbProc) { try { kbProc.kill(); } catch {} } send('kb:progress', { done: true }); c === 0 ? res(last) : rej(new Error(err.trim().split('\n').pop() || 'La indexación falló')); });
  });
}
// OCR de los libros escaneados (Tesseract): corre en segundo plano con prioridad baja y avisa el avance
let kbOcr = null;
function kbRunOcr() {
  if (kbOcr || kbIngest) throw new Error('Ya hay una tarea de biblioteca en curso.'); const sc = kbScript(); if (!sc) throw new Error('No se encontró el motor de biblioteca (capichad_kb.py).');
  if (kbProc) { try { kbProc.kill(); } catch {} kbProc = null; }
  return new Promise((res, rej) => {
    const p = spawn(pyExe(), [sc, 'ocr', '--workers', '4', '--db', kbDb()], { windowsHide: true, env: pyEnv }); kbOcr = p; let last = null, err = '', buf = '';
    try { os.setPriority(p.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch {}
    p.stdout.setEncoding('utf8'); p.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); try { last = JSON.parse(l); send('kb:ocrprogress', last); } catch {} } });
    p.stderr.on('data', d => err += d);
    p.on('error', e => { kbOcr = null; rej(new Error('No se pudo ejecutar Python: ' + e.message)); });
    p.on('close', c => { kbOcr = null; send('kb:ocrprogress', { done: true }); c === 0 ? res(last) : rej(new Error(err.trim().split('\n').pop() || 'El OCR falló')); });
  });
}
// herramientas sueltas (quitar fondo, convertir documentos, crear imágenes): se ejecutan y devuelven JSON
function runTool(cmd, args, ms = 600000, env = {}) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { windowsHide: true, env: { ...pyEnv, ...env } }); let out = '', err = '';
    const t = setTimeout(() => { try { p.kill(); } catch {} rej(new Error('La herramienta tardó demasiado.')); }, ms);
    p.stdout.setEncoding('utf8'); p.stdout.on('data', d => out += d); p.stderr.on('data', d => err += d);
    p.on('error', e => { clearTimeout(t); rej(new Error('No se pudo ejecutar: ' + e.message)); });
    p.on('close', c => { clearTimeout(t); res({ code: c, out: out.trim(), err: err.trim() }); });
  });
}
// ---------- modo Programar: llamada al modelo con streaming (sin razonamiento largo) ----------
let progRun = null;
async function progChat({ model, messages, options, onToken, signal }) {
  const body = { model, messages, stream: true, options, keep_alive: '15m' };
  // gpt-oss admite niveles: "low" casi elimina el razonamiento (medido: 45 s vs 269 s); los qwen3 instruct/coder no razonan
  if (/gpt-oss/i.test(model)) body.think = 'low'; else if (!/instruct|coder/i.test(model) && await modelThinks(model)) body.think = true;
  let text = '', thinking = '', last = null;
  for await (const j of ostream('/api/chat', body, signal)) {
    if (j.error) throw new Error(friendly(j.error));
    if (j.message) { text += j.message.content || ''; thinking += j.message.thinking || ''; if (onToken) onToken(); }
    if (j.done) last = j;
  }
  return { text, thinking, evalCount: last && last.eval_count, doneReason: last && last.done_reason };
}
// ---------- internet: se comprueba con una conexión TCP corta (sin DNS) y se cachea unos segundos ----------
let webNet = { at: 0, on: false };
function tcpUp(host, port, ms = 2500) {
  return new Promise(res => {
    const s = require('net').connect({ host, port }); const t = setTimeout(() => { s.destroy(); res(false); }, ms);
    s.on('connect', () => { clearTimeout(t); s.destroy(); res(true); }); s.on('error', () => { clearTimeout(t); res(false); });
  });
}
async function webOnline() {
  if (Date.now() - webNet.at < 20000) return webNet.on;
  const on = (await Promise.all([tcpUp('1.1.1.1', 443), tcpUp('8.8.8.8', 443)])).some(Boolean);
  webNet = { at: Date.now(), on }; return on;
}
async function webRun(args, ms = 45000) {
  const sc = toolPath('capichad_web.py'); if (!sc) throw new Error('Falta el módulo de internet (capichad_web.py).');
  const r = await runTool(pyExe(), [sc, ...args], ms);
  const j = lastJson(r.out); if (j === null) throw new Error(r.err.split('\n').pop() || 'Sin respuesta de internet');
  if (j && j.error) throw new Error(j.error);
  return j;
}
// ---------- plataforma: CPU (Intel/AMD), GPU (NVIDIA/AMD/Intel), arquitectura y sistema ----------
const gpuVendor = n => /nvidia|geforce|quadro|\brtx\b|\bgtx\b|tesla/i.test(n) ? 'NVIDIA' : /\bamd\b|radeon|\bati\b|firepro|\bvega\b/i.test(n) ? 'AMD' : /intel|\buhd\b|\biris\b|\barc\b/i.test(n) ? 'Intel' : 'Otra';
const gpuVirtual = n => /microsoft basic|remote|virtual|vmware|hyper-v|parsec|displaylink|meta virtual|indirect/i.test(n);
const gpuIntegrated = (n, vendor) => vendor === 'Intel' ? !/\barc\b/i.test(n) : vendor === 'AMD' ? /radeon\(tm\) graphics|radeon graphics|\bvega \d+|radeon (r\d|hd|\d{3}m)|radeon 6\d\dm|780m|760m|680m|660m/i.test(n) : false;
let platformCache = null;
async function detectPlatform() {
  if (platformCache) return platformCache;
  const r = await psJson(`
Add-Type -Namespace W -Name K -MemberDefinition '[DllImport("kernel32.dll")] public static extern bool IsProcessorFeaturePresent(uint f);'
$arch = $env:PROCESSOR_ARCHITEW6432; if (-not $arch) { $arch = $env:PROCESSOR_ARCHITECTURE }
$o = Get-CimInstance Win32_OperatingSystem
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$vc = @(Get-CimInstance Win32_VideoController | ForEach-Object { [pscustomobject]@{ name=$_.Name; driver=$_.DriverVersion; ram=$_.AdapterRAM } })
$reg = @(Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\0*' | Where-Object { $_.DriverDesc } | ForEach-Object { $v = $_.'HardwareInformation.qwMemorySize'; if ($v -is [byte[]]) { $v = [BitConverter]::ToUInt64($v,0) }; [pscustomobject]@{ name=$_.DriverDesc; vram=$v } })
[pscustomobject]@{ avx=[W.K]::IsProcessorFeaturePresent(39); avx2=[W.K]::IsProcessorFeaturePresent(40); avx512=[W.K]::IsProcessorFeaturePresent(41);
  arch="$arch"; osBits=$(if ("$($o.OSArchitecture)" -match '64') { 64 } else { 32 }); osCaption="$($o.Caption)"; osBuild="$($o.BuildNumber)";
  cpuName="$($cpu.Name)".Trim(); cpuMfr="$($cpu.Manufacturer)"; cpuCores=$cpu.NumberOfCores; cpuThreads=$cpu.NumberOfLogicalProcessors; gpus=$vc; reg=$reg } | ConvertTo-Json -Depth 4 -Compress`, 25000);
  const model = (os.cpus()[0] || {}).model || '';
  const cpuText = ((r && r.cpuName) || model) + ' ' + ((r && r.cpuMfr) || '');
  const archRaw = String((r && r.arch) || process.arch || '').toUpperCase();
  const arch = /ARM/.test(archRaw) ? 'arm64' : /AMD64|X64|EM64T/.test(archRaw) ? 'x64' : /X86/.test(archRaw) ? 'x86' : String(process.arch);
  const cpu = { vendor: /intel/i.test(cpuText) ? 'Intel' : /amd|ryzen|epyc|athlon|threadripper/i.test(cpuText) ? 'AMD' : 'Otro', name: ((r && r.cpuName) || model).replace(/\s+/g, ' ').trim(),
    cores: (r && r.cpuCores) || Math.max(1, Math.round(os.cpus().length / 2)), threads: (r && r.cpuThreads) || os.cpus().length,
    avx: r ? !!r.avx : null, avx2: r ? !!r.avx2 : null, avx512: r ? !!r.avx512 : null };
  if (cpu.avx === null) { delete cpu.avx; delete cpu.avx2; delete cpu.avx512; }   // no se pudo comprobar: no se asume nada
  const nv = await gpuInfo(); const regByName = new Map(arr(r && r.reg).map(x => [String(x.name || '').toLowerCase(), x.vram]));
  const gpus = [];
  for (const g of arr(r && r.gpus)) {
    const name = String(g.name || '').trim(); if (!name || gpuVirtual(name)) continue;
    const vendor = gpuVendor(name); let vram = 0;
    if (vendor === 'NVIDIA' && nv && nv.vramTotal) vram = nv.vramTotal;                              // nvidia-smi: exacto
    else { const rv = Number(regByName.get(name.toLowerCase())) || 0; const lg = Number(g.ram) || 0; vram = (rv || (lg && lg < 4294967295 ? lg : 0)) / 1024 ** 3; }
    gpus.push({ name, vendor, vramGB: +vram.toFixed(1), integrated: gpuIntegrated(name, vendor), driver: g.driver || '' });
  }
  if (!gpus.length && nv) gpus.push({ name: nv.name, vendor: 'NVIDIA', vramGB: +nv.vramTotal.toFixed(1), integrated: false, driver: nv.driver || '' });
  gpus.sort((a, b) => (a.integrated - b.integrated) || ({ NVIDIA: 0, AMD: 1, Intel: 2, Otra: 3 }[a.vendor] - { NVIDIA: 0, AMD: 1, Intel: 2, Otra: 3 }[b.vendor]) || b.vramGB - a.vramGB);
  const nvidia = gpus.find(g => g.vendor === 'NVIDIA' && !g.integrated) || null;
  platformCache = { cpu, arch, osBits: (r && r.osBits) || (os.arch() === 'x64' ? 64 : 32), os: (r && r.osCaption) || os.release(), gpus, gpu: nvidia ? { name: nvidia.name, vramGB: nvidia.vramGB } : null,
    gpuPrimary: gpus[0] || null, remote: isRemoteOllama() };
  return platformCache;
}

// ---------- plan de instalación según el equipo + descargas automáticas ----------
const libCatalog = () => { try { return JSON.parse(fs.readFileSync(process.env.IA_CATALOG || path.join(__dirname, 'catalog', 'biblioteca.json'), 'utf8')); } catch { return { packs: [], mirrors: ['https://download.kiwix.org/zim/'] }; } };
const planStateFile = () => path.join(app.getPath('userData'), 'plan-state.json');
let dlm = null;           // gestor de descargas (único)
let installRun = null;    // { ac, running, summary, selection, stage }
function downloads() {
  if (dlm) return dlm;
  dlm = new DownloadManager({ parallel: 2, minFreeBytes: 25 * 1024 ** 3, maxBps: (cfg.dlMaxMBs || 0) * 1024 * 1024, stateFile: path.join(app.getPath('userData'), 'downloads.json') });
  dlm.on('item', e => send('plan:event', { t: 'item', ...e }));
  setInterval(() => { if (dlm && dlm.snapshot().pending) { const s = dlm.snapshot(); send('plan:event', { t: 'overall', done: s.done, total: s.total, bps: s.bps, pending: s.pending }); } }, 1000);
  return dlm;
}
// Python 3.10–3.13 del sistema (solo para el motor de imágenes): ['py','-3.12'] o null
async function findPy() {
  for (const v of ['3.13', '3.12', '3.11', '3.10']) {
    const ok = await new Promise(res => execFile('py', ['-' + v, '-c', 'print(1)'], { windowsHide: true, timeout: 6000 }, e => res(!e)));
    if (ok) return ['py', '-' + v];
  }
  return null;
}
function libPrefixes() {
  const set = new Set(); const root = path.join(KB_HOME, 'biblioteca');
  (function walk(d) { let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) { if (e.isDirectory()) { if (e.name !== 'libros') walk(path.join(d, e.name)); } else if (/\.zim$/i.test(e.name)) set.add(e.name.replace(/_\d{4}-\d{2}[a-z]?\.zim$/i, '')); } })(root);
  return set;
}
async function planInput() {
  const drive = path.parse(path.resolve(KB_HOME)).root; let freeGB = 0;
  try { const s = fs.statfsSync(drive); freeGB = Number(s.bavail) * Number(s.bsize) / 1024 ** 3; } catch {}
  const plat = await detectPlatform();
  let media = '';
  try { const r = await psJson(`$p=Get-Partition -DriveLetter "${drive[0]}"; $d=Get-PhysicalDisk | ?{$_.DeviceId -eq "$($p.DiskNumber)"}; [pscustomobject]@{m="$($d.MediaType)"}|ConvertTo-Json -Compress`, 8000); media = String((r && r.m) || '').toUpperCase().replace('UNSPECIFIED', ''); } catch {}
  let models = []; try { if (await ping()) models = ((await oget('/api/tags')).models || []).map(m => m.name); } catch {}
  const have = libPrefixes(); const lib = libCatalog();
  const packs = lib.packs.filter(p => p.items.length && p.items.every(i => have.has(i.prefix))).map(p => p.id);
  const sitesDir = path.join(KB_HOME, 'biblioteca', 'libros', 'sitios');
  const hw = { ramTotalGB: os.totalmem() / 1024 ** 3, diskFreeGB: freeGB, diskMedia: media, gpu: plat.gpu, gpus: plat.gpus, gpuPrimary: plat.gpuPrimary,
    cpu: plat.cpu, arch: plat.arch, osBits: plat.osBits, osName: plat.os, remote: plat.remote, cores: plat.cpu.cores, python: !!(await findPy()), officeFound: !!sofficeExe(), kbHome: KB_HOME, libZims: have.size,
    installed: { models, packs, engine: !!imageEnginePython(), office: !!sofficeExe(), sites: fs.existsSync(sitesDir) && fs.readdirSync(sitesDir).length >= 5 } };
  if (process.env.IA_HW_OVERRIDE) { try { Object.assign(hw, JSON.parse(process.env.IA_HW_OVERRIDE)); } catch {} }   // pruebas de perfiles
  return hw;
}
async function buildPlan() { const hw = await planInput(); const lib = libCatalog(); return { hw, lib, plan: PLAN.recommend(hw, lib) }; }

function spawnLines(cmd, args, opts, onLine, signal, stdin) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { windowsHide: true, env: pyEnv, ...opts }); let buf = '', all = '';
    const feed = d => { all += d; buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (l && onLine) onLine(l); } };
    p.stdout.setEncoding('utf8'); p.stdout.on('data', feed); p.stderr.setEncoding('utf8'); p.stderr.on('data', d => { all += d; });
    if (signal) signal.addEventListener('abort', () => { try { p.kill(); } catch {} });
    if (stdin != null) { p.stdin.write(stdin); p.stdin.end(); }
    p.on('error', rej); p.on('close', c => res({ code: c, out: all }));
  });
}

async function runInstallJob(selection) {
  const { plan, lib } = await buildPlan(); const ac = new AbortController(); const emit = e => send('plan:event', e);
  installRun = { ac, running: true, summary: null, selection, stage: 'start' };
  try { fs.writeFileSync(planStateFile(), JSON.stringify({ selection, at: Date.now() })); } catch {}
  const dm = downloads(); dm.resume();
  const ctx = {
    kbHome: KB_HOME, lib, plan, dm, mirrors: lib.mirrors || ['https://download.kiwix.org/zim/'], signal: ac.signal,
    emit: e => { if (e.t === 'stage') installRun.stage = e.stage; emit(e); },
    pullModel: async (m, onProg, signal) => {
      if (!(await ensureServer())) throw new Error('Ollama no está disponible. Instálalo y ábrelo, y vuelve a intentarlo.');
      let t0 = Date.now(), n0 = 0, bps = 0;
      for await (const j of ostream('/api/pull', { model: m.ollama, stream: true }, signal)) {
        if (j.error) throw new Error(j.error);
        if (j.total) { const now = Date.now(); if (now - t0 >= 1000) { bps = Math.round((j.completed - n0) * 1000 / (now - t0)); t0 = now; n0 = j.completed; } onProg({ completed: j.completed, total: j.total, bps }); }
      }
      // nombre corto único: se copia al alias y se quita el nombre largo (los archivos del modelo se comparten, no se duplican)
      if (m.alias) {
        try { await opost('/api/copy', { source: m.ollama, destination: m.alias });
          await fetch(OLLAMA + '/api/delete', { method: 'DELETE', body: JSON.stringify({ model: m.ollama }) }); } catch {}
      }
    },
    installEngine: async (onLine, signal) => {
      const sc = toolPath('instalar_motor_imagenes.py'); if (!sc) throw new Error('Falta instalar_motor_imagenes.py');
      const py = await findPy(); if (!py) throw new Error('Falta Python 3.10–3.13 (https://www.python.org/downloads/windows/). Instálalo y reintenta desde Descargas.');
      const r = await spawnLines(py[0], [py[1], '-u', sc], {}, l => onLine({ text: l.replace(/^===\s*\[[^\]]*\]\s*/, '').slice(0, 110) }), signal);
      if (r.code !== 0) throw new Error('El instalador del motor terminó con código ' + r.code + ': ' + r.out.trim().split('\n').slice(-2).join(' | ').slice(0, 200));
      return true;
    },
    installOffice: async (onLine, signal) => {
      if (sofficeExe()) return true;
      const base = 'https://download.documentfoundation.org/libreoffice/stable/';
      const html = await (await fetch(base, { signal })).text();
      const vers = [...html.matchAll(/href="(\d+\.\d+\.\d+)\/"/g)].map(m => m[1]).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      const v = vers[vers.length - 1]; if (!v) throw new Error('No se encontró la versión de LibreOffice.');
      const name = `LibreOffice_${v}_Win_x86-64.msi`, url = `${base}${v}/win/x86_64/${name}`, dest = path.join(KB_HOME, 'herramientas', 'descargas', name);
      await new Promise((res, rej) => {
        const id = 'office:' + name;
        const h = e => { if (e.id !== id) return; if (e.state === 'done') { dm.off('item', h); res(); } else if (['error', 'nospace', 'cancelled'].includes(e.state)) { dm.off('item', h); rej(new Error(e.error || e.state)); } else onLine({ done: e.done, bytes: e.bytes, bps: e.bps }); };
        dm.on('item', h); dm.add({ id, urls: [url], sha256Urls: [url + '.sha256'], dest, title: name, group: 'e_office' });
      });
      onLine({ text: 'Extrayendo LibreOffice…' });
      await runTool('msiexec.exe', ['/a', dest, '/qn', `TARGETDIR=${path.join(KB_HOME, 'herramientas', 'libreoffice')}`], 1800000);
      try { fs.unlinkSync(dest); } catch {}
      return !!sofficeExe();
    },
    copySites: async (sites, onLine, signal) => {
      const sc = toolPath('copiar_sitio.py'); if (!sc) throw new Error('Falta copiar_sitio.py');
      const root = path.join(KB_HOME, 'biblioteca', 'libros', 'sitios'); let ok = 0;
      for (let i = 0; i < sites.length; i++) {
        if (signal.aborted) break; const [name, url, max] = sites[i]; const dest = path.join(root, name);
        if (fs.existsSync(path.join(dest, '.listo'))) { ok++; continue; }
        onLine({ text: `${name} (${i + 1}/${sites.length})`, done: i, bytes: sites.length });
        const r = await runTool(pyExe(), [sc, url, dest, String(max)], 900000);
        if (r.code === 0) { try { fs.writeFileSync(path.join(dest, '.listo'), ''); } catch {} ok++; }
      }
      return ok >= Math.ceil(sites.length / 2);
    },
    zimCheck: async files => {
      const sc = kbScript(); const r = await spawnLines(pyExe(), [sc, 'zimcheck'], {}, null, null, JSON.stringify(files));
      const j = lastJson(r.out); if (!j) throw new Error('Sin respuesta del verificador');
      return j;
    },
    ingest: async (folder, topic, onLine) => {
      const sc = kbScript(); const r = await spawnLines(pyExe(), [sc, 'ingest', folder, '--topic', topic, '--db', kbDb()], {}, l => { try { const j = JSON.parse(l); if (j.n) onLine({ n: j.n, total: j.total, book: j.book }); } catch {} });
      if (r.code !== 0) throw new Error('El indexado terminó con código ' + r.code);
    },
    restartKb: async () => { if (kbProc) { try { kbProc.kill(); } catch {} kbProc = null; kbBuf = ''; } kbStart(); },
    optimizeKb: async () => { const sc = kbScript(); await runTool(pyExe(), [sc, 'optimize', '--db', kbDb()], 900000); }
  };
  try {
    const sum = await INSTALLER.runInstall(ctx, selection);
    installRun.summary = sum; installRun.running = false; installRun.stage = 'done';
    if (!sum.aborted) { try { fs.unlinkSync(planStateFile()); } catch {} cfg = { ...cfg, setupDone: true, lastInstall: { at: Date.now(), zims: sum.zims, models: sum.models, ok: sum.ok } }; saveCfg(); }
    return sum;
  } catch (e) { installRun.running = false; installRun.summary = { ok: false, notes: [e.message], error: e.message }; emit({ t: 'done', summary: installRun.summary }); throw e; }
}

// motor de imágenes: CAPICHAD_IMAGEGEN, el propio de CapiChad o (si existe) el de ReelStoryMaker
function imageEnginePython() {
  const base = process.env.LOCALAPPDATA || '';
  const dirs = [process.env.CAPICHAD_IMAGEGEN, path.join(base, 'CapiChad', 'imagegen'), path.join(base, 'ReelStoryMaker', 'imagegen')].filter(Boolean);
  const hit = dirs.map(d => path.join(d, 'venv', 'Scripts', 'python.exe')).find(p => fs.existsSync(p));
  return hit || null;
}
// solo se sirven imágenes de las carpetas propias (galería y resultados de herramientas)
const okImg = f => [D('imagenes'), D('herramientas')].some(d => f.startsWith(path.resolve(d) + path.sep)) && /\.(jpe?g|png|webp)$/i.test(f);
const lastJson = s => { for (const l of String(s).split('\n').reverse()) { try { return JSON.parse(l.trim()); } catch {} } return null; };
const outDir = () => { const d = D('herramientas'); fs.mkdirSync(d, { recursive: true }); return d; };
const uniqueOut = (base, ext) => { let n = 0, f; do { f = path.join(outDir(), base + (n ? `_${n}` : '') + ext); n++; } while (fs.existsSync(f)); return f; };
function sofficeExe() {
  const c = [toolPath('libreoffice', 'program', 'soffice.exe'), toolPath('libreoffice', 'LibreOffice', 'program', 'soffice.exe'),
    'C:/Program Files/LibreOffice/program/soffice.exe', 'C:/Program Files (x86)/LibreOffice/program/soffice.exe'].filter(Boolean);
  return c.find(p => fs.existsSync(p)) || null;
}
app.on('before-quit', () => { try { kbProc && kbProc.kill(); kbIngest && kbIngest.kill(); kbOcr && kbOcr.kill(); } catch {} });

// ---------- IPC ----------
const aborts = new Map();
const H = {
  // ventana
  'test:shot': async name => { if (!process.env.IA_SHOT) return false; fs.mkdirSync(process.env.IA_SHOT, { recursive: true }); fs.writeFileSync(path.join(process.env.IA_SHOT, name + '.png'), (await win.webContents.capturePage()).toPNG()); return true; },
  'win:min': () => win.minimize(),
  'win:max': () => (win.isMaximized() ? win.unmaximize() : win.maximize()),
  'win:close': () => win.close(),
  // sistema
  'sys:info': async () => { const plat = await detectPlatform().catch(() => null); return ({ ramTotal: os.totalmem(), ramFree: os.freemem(), disk: diskFree(), cpu: os.cpus()[0].model.trim(), cores: os.cpus().length, gpu: await gpuInfo(), dataDir: cfg.dataDir, version: app.getVersion(),
    platform: plat ? { cpu: plat.cpu, arch: plat.arch, osBits: plat.osBits, os: plat.os, gpus: plat.gpus, gpuPrimary: plat.gpuPrimary, remote: plat.remote, ollamaHost: OLLAMA } : null }); },
  'sys:perf': async () => {
    let ps = []; try { ps = (await oget('/api/ps')).models || []; } catch {}
    ensureProbe();
    return { ramUsed: os.totalmem() - os.freemem(), ramTotal: os.totalmem(), cpu: cpuPct, cores: corePct, cpuMHz: probeLast?.mhz ?? null, cpuPerf: probeLast?.perf ?? null, gpu: await gpuInfo(), loaded: ps.map(m => ({ name: m.name, size: m.size, vram: m.size_vram })) };
  },
  'sys:hw': () => hardware(),
  'sys:storage': () => storage(),
  'models:dir': () => modelsDir(),
  'models:moveDir': dest => moveModels(dest),
  'dir:remove': async dir => { const p = path.resolve(dir); if (p.split(path.sep).length < 3) throw new Error('Ruta no permitida.'); if (sameDir(p, modelsDir()) || sameDir(p, cfg.dataDir)) throw new Error('Esa carpeta está en uso.'); await fs.promises.rm(p, { recursive: true, force: true }); sizeCache.t = 0; return true; },
  'cfg:moveDataAsync': async dest => {
    const from = cfg.dataDir; if (sameDir(from, dest)) throw new Error('Esa ya es la carpeta de datos actual.'); fs.mkdirSync(dest, { recursive: true });
    await fs.promises.cp(from, dest, { recursive: true, force: true }); cfg.dataDir = dest; saveCfg(); ensureDirs(); chunkCache.clear(); sizeCache.t = 0; return { from, to: dest };
  },
  'net:check': async () => { try { await fetch('https://ollama.com', { method: 'HEAD', signal: AbortSignal.timeout(3500) }); return true; } catch { return false; } },
  // ollama / modelos
  'ollama:status': async () => ({ installed: !!ollamaExe(), running: await ping() }),
  'ollama:start': () => ensureServer(),
  'ollama:openDownload': () => shell.openExternal('https://ollama.com/download'),
  // instala el motor desde un OllamaSetup.exe local (paquete offline / USB): sin internet
  'ollama:installFrom': async () => {
    const near = [process.resourcesPath && path.join(process.resourcesPath, 'tools', 'instaladores', 'OllamaSetup.exe'),
      path.join(path.dirname(app.getPath('exe')), 'OllamaSetup.exe'), path.join(os.homedir(), 'Desktop', 'Paquete-CapiChad-Offline', 'OllamaSetup.exe'),
      path.join(os.homedir(), 'Downloads', 'OllamaSetup.exe')].filter(Boolean);
    let f = near.find(p => fs.existsSync(p));
    if (!f) { const r = await dialog.showOpenDialog(win, { title: 'Elegir OllamaSetup.exe', filters: [{ name: 'Instalador de Ollama', extensions: ['exe'] }], properties: ['openFile'] }); if (r.canceled) return { cancelled: true }; f = r.filePaths[0]; }
    await new Promise((res, rej) => { const p = spawn(f, ['/VERYSILENT', '/NORESTART', '/SUPPRESSMSGBOXES'], { windowsHide: true }); p.on('error', rej); p.on('close', c => c === 0 ? res() : rej(new Error('El instalador terminó con código ' + c))); });
    for (let i = 0; i < 20 && !ollamaExe(); i++) await new Promise(r => setTimeout(r, 1000));
    return { installed: !!ollamaExe(), running: await ensureServer() };
  },
  // descarga e instala Ollama sin intervención (≈1.5 GB; reanudable). El avance llega como 'plan:event' (id ollama:setup)
  'ollama:autoInstall': async () => {
    if (ollamaExe()) return { installed: true, running: await ensureServer() };
    const dm = downloads(); const dest = path.join(app.getPath('temp'), 'OllamaSetup-capichad.exe');
    const id = 'ollama:setup';
    await new Promise((res, rej) => {
      const h = e => { if (e.id !== id) return; if (e.state === 'done') { dm.off('item', h); res(); } else if (['error', 'nospace', 'cancelled'].includes(e.state)) { dm.off('item', h); rej(new Error(e.error || 'No se pudo descargar Ollama')); } };
      dm.on('item', h); dm.resume();
      dm.add({ id, urls: ['https://ollama.com/download/OllamaSetup.exe', 'https://github.com/ollama/ollama/releases/latest/download/OllamaSetup.exe'], dest, title: 'Motor de IA (Ollama)', group: 'ollama', bytes: 1.5e9 });
    });
    await new Promise((res, rej) => { const p = spawn(dest, ['/VERYSILENT', '/NORESTART', '/SUPPRESSMSGBOXES'], { windowsHide: true }); p.on('error', rej); p.on('close', c => c === 0 ? res() : rej(new Error('El instalador de Ollama terminó con código ' + c))); });
    for (let i = 0; i < 30 && !ollamaExe(); i++) await new Promise(r => setTimeout(r, 1000));
    try { fs.unlinkSync(dest); } catch {}
    return { installed: !!ollamaExe(), running: await ensureServer() };
  },
  'models:list': async () => { if (!(await ensureServer())) return []; const t = await oget('/api/tags'); return t.models.map(m => ({ name: m.name, size: m.size, params: m.details?.parameter_size, quant: m.details?.quantization_level, family: m.details?.family, modified: m.modified_at })); },
  'models:show': async n => opost('/api/show', { model: n }),
  'models:delete': async n => { const r = await fetch(OLLAMA + '/api/delete', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: n }) }); if (!r.ok) throw new Error(await r.text()); return true; },
  'models:stop': async n => { await opost('/api/generate', { model: n, keep_alive: 0 }); return true; },
  'models:pull': async n => {
    if (!(await ensureServer())) throw new Error('Ollama no está disponible'); const ac = new AbortController(); aborts.set('pull:' + n, ac);
    try { for await (const j of ostream('/api/pull', { model: n, stream: true }, ac.signal)) { if (j.error) throw new Error(j.error); send('pull:progress', { name: n, status: j.status, total: j.total, completed: j.completed }); } }
    finally { aborts.delete('pull:' + n); } send('pull:progress', { name: n, status: 'listo', done: true }); return true;
  },
  'models:pullCancel': n => { aborts.get('pull:' + n)?.abort(); return true; },
  'models:pickFile': async () => { const r = await dialog.showOpenDialog(win, { title: 'Elegir modelo (.gguf)', filters: [{ name: 'Modelo GGUF', extensions: ['gguf'] }], properties: ['openFile'] }); return r.canceled ? null : r.filePaths[0]; },
  'models:import': async (file, name) => {
    if (!(await ensureServer())) throw new Error('Ollama no está disponible'); const exe = ollamaExe();
    const mf = path.join(app.getPath('temp'), 'Modelfile-' + uid()); fs.writeFileSync(mf, `FROM "${file.replace(/\\/g, '/')}"\n`);
    return new Promise((res, rej) => { const p = spawn(exe, ['create', name, '-f', mf], { windowsHide: true }); let err = '';
      p.stdout.on('data', d => send('pull:progress', { name, status: d.toString().trim().split(/\r?\n/).pop() })); p.stderr.on('data', d => { err += d; send('pull:progress', { name, status: d.toString().trim().split(/\r?\n/).pop() }); });
      p.on('close', c => { try { fs.unlinkSync(mf); } catch {} send('pull:progress', { name, status: 'listo', done: true }); c === 0 ? res(true) : rej(new Error(err.trim().split('\n').pop() || 'No se pudo importar')); }); });
  },
  // chat
  'chat:send': async (id, payload) => {
    if (!(await ensureServer())) { send('chat:chunk', { id, error: 'Ollama no está disponible. Ábrelo desde Rendimiento o reinstálalo.' }); return; }
    titleAC?.abort();
    const ac = new AbortController(); aborts.set(id, ac); const t0 = Date.now(); let n = 0;
    try {
      const body = { ...payload, stream: true };
      // modelos sin razonamiento (qwen3-coder, gemma…) responden 400 si reciben think: se omite según su capacidad
      if (body.think && !(await modelThinks(body.model))) delete body.think;
      for await (const j of ostream('/api/chat', body, ac.signal)) {
        if (j.error) throw new Error(j.error);
        if (j.message) { n++; send('chat:chunk', { id, content: j.message.content || '', thinking: j.message.thinking || '' }); }
        if (j.done) send('chat:chunk', { id, done: true, stats: { tokens: j.eval_count, tps: j.eval_count && j.eval_duration ? j.eval_count / (j.eval_duration / 1e9) : null, ms: Date.now() - t0 } });
      }
    } catch (e) { if (e.name === 'AbortError') send('chat:chunk', { id, done: true, aborted: true }); else send('chat:chunk', { id, error: friendly(e.message) }); }
    finally { aborts.delete(id); }
  },
  'chat:abort': id => { aborts.get(id)?.abort(); return true; },
  // historial
  'chats:list': () => fs.readdirSync(D('chats')).filter(f => f.endsWith('.json')).map(f => { const c = readJson(D('chats', f), null); return c && { id: c.id, title: c.title, pinned: !!c.pinned, titled: !!(c.titled || c.renamed), updatedAt: c.updatedAt, model: c.model, count: c.msgs.length, preview: (c.msgs.find(m => m.role === 'assistant')?.content || c.msgs[0]?.content || '').slice(0, 140), text: c.msgs.map(m => m.content).join(' ').slice(0, 20000).toLowerCase() }; }).filter(Boolean).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt - a.updatedAt),
  // cambia solo título / fijado / renombrado sin reescribir el chat completo
  'chats:patch': (id, patch) => {
    const file = D('chats', safe(id) + '.json'); const c = readJson(file, null); if (!c) return false;
    for (const k of ['title', 'pinned', 'renamed', 'titled']) if (patch && k in patch) c[k] = k === 'title' ? String(patch[k]).slice(0, 80) : !!patch[k];
    writeJson(file, c); return true;
  },
  // título corto para un chat, con el mismo modelo que ya está cargado (no fuerza cargar otro)
  // Los modelos que "razonan" (qwen3, gpt-oss) ignoran think:false y gastan decenas de segundos en pensar:
  // con ellos no se pide título al modelo y la interfaz conserva el título limpio derivado de la pregunta.
  'chat:title': async (model, userText, answerText) => {
    if (!(await ensureServer())) return null;
    if (await modelThinks(model)) return null;
    titleAC?.abort(); const ac = titleAC = new AbortController();
    const prompt = 'Escribe un título muy corto (de 2 a 5 palabras, sin comillas, sin punto final) que resuma esta conversación. ' +
      'Responde SOLO con el título, en el mismo idioma del usuario.\n\nUsuario: ' + String(userText || '').slice(0, 400) + '\nAsistente: ' + String(answerText || '').slice(0, 400);
    const body = { model, stream: false, keep_alive: '5m', messages: [{ role: 'user', content: prompt }], options: { temperature: 0.2, num_predict: 40, num_ctx: 2048 } };
    let r; try {
      const resp = await fetch(OLLAMA + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.any([ac.signal, AbortSignal.timeout(45000)]) });
      if (!resp.ok) return null; r = await resp.json();
    } catch { return null; } finally { if (titleAC === ac) titleAC = null; }
    let t = String(r?.message?.content || '').split('\n').map(s => s.trim()).find(Boolean) || '';
    if (/^(okay|ok,|let'?s|let me|the user|hmm|first,|alright|bien,|vale,)/i.test(t)) return null;   // es razonamiento, no un título
    t = t.replace(/^(t[ií]tulo|title)\s*[:：-]\s*/i, '').replace(/[*_`#"“”«»]/g, '').replace(/[.:;,!¡?¿\s]+$/g, '').replace(/^[¡¿\s]+/, '').trim();
    if (!t || t.length < 3) return null;
    t = t.split(/\s+/).slice(0, 7).join(' '); if (t.length > 52) t = t.slice(0, 50).replace(/\s+\S*$/, '') + '…';
    return t.charAt(0).toUpperCase() + t.slice(1);
  },
  'chats:get': id => readJson(D('chats', safe(id) + '.json'), null),
  'chats:save': c => { if (!cfg.saveHistory) return true; writeJson(D('chats', safe(c.id) + '.json'), c); return true; },
  'chats:delete': id => { try { fs.unlinkSync(D('chats', safe(id) + '.json')); } catch {} return true; },
  'chats:clear': () => { fs.readdirSync(D('chats')).forEach(f => fs.unlinkSync(D('chats', f))); return true; },
  // asistentes
  'assistants:list': () => readJson(D('assistants.json'), null) || seedAssistants(),
  'assistants:save': a => { const l = readJson(D('assistants.json'), null) || seedAssistants(); if (!a.id) a.id = uid(); const i = l.findIndex(x => x.id === a.id); i >= 0 ? l[i] = a : l.push(a); writeJson(D('assistants.json'), l); return a; },
  'assistants:delete': id => { writeJson(D('assistants.json'), (readJson(D('assistants.json'), []) || []).filter(a => a.id !== id)); return true; },
  // documentos
  'docs:list': () => docsIndex(),
  'docs:pick': async () => { const r = await dialog.showOpenDialog(win, { title: 'Añadir documentos', filters: [{ name: 'Documentos', extensions: ['pdf', 'docx', 'txt', 'md', 'csv', 'json', 'html', 'py', 'js', 'ts', 'java', 'c', 'cpp', 'cs', 'php', 'sql', 'log'] }], properties: ['openFile', 'multiSelections'] }); return r.canceled ? [] : r.filePaths; },
  'docs:add': async files => { const out = []; for (const f of files) out.push(await addDocument(f)); return out; },
  'docs:remove': id => { saveDocsIndex(docsIndex().filter(d => d.id !== id)); chunkCache.delete(id); for (const f of fs.readdirSync(D('docs', 'files'))) if (f.startsWith(id)) fs.unlinkSync(D('docs', 'files', f)); try { fs.unlinkSync(D('docs', 'chunks', safe(id) + '.json')); } catch {} return true; },
  'docs:search': (q, ids, k) => searchDocs(q, ids, k),
  'docs:fileUrl': id => { const f = fs.readdirSync(D('docs', 'files')).find(x => x.startsWith(id)); return f ? 'file:///' + D('docs', 'files', f).replace(/\\/g, '/') : null; },
  'docs:read': id => { const f = fs.readdirSync(D('docs', 'files')).find(x => x.startsWith(id)); return f ? fs.readFileSync(D('docs', 'files', f)) : null; },
  'docs:open': id => { const f = fs.readdirSync(D('docs', 'files')).find(x => x.startsWith(id)); if (f) shell.openPath(D('docs', 'files', f)); return true; },
  // conocimiento (libros indexados)
  'kb:status': async () => { const st = await kb('status'); return st ? { ...st, db: kbDb(), ingesting: !!kbIngest, ocring: !!kbOcr, folders: cfg.kbFolders || [] } : { libros: 0, paginas: 0, fragmentos: 0, temas: {}, db: kbDb(), ingesting: !!kbIngest, ocring: !!kbOcr, folders: cfg.kbFolders || [], empty: true }; },
  'kb:search': async (q, k = 6) => (await kb('searchall', { q, k })) || [],
  // búsqueda inteligente: el modelo extrae palabras clave en español e inglés y se consultan ambas
  'kb:smart': async (text, model, k = 6) => {
    let es = '', en = '';
    // los modelos que razonan no sirven para extraer palabras clave (ignoran think:false y agotan el tiempo): se hace sin modelo
    const usaModelo = model && text.split(/\s+/).length > 3 && !(await modelThinks(model));
    if (!usaModelo) {
      const STOP = new Set(('de la el en y a los las del se que un una por con para es al lo como más mas pero sus le ya o este si porque esta entre cuando muy sin sobre también tambien me hasta hay donde quien desde todo nos durante todos uno les ni contra otros ese eso ante esto antes algunos qué unos yo otro otra él tanto esa estos mucho quienes nada muchos cual poco ella estar estas algo mi mis tu te ti tus puedo puedes puede podría podrias hacer hola gracias favor quiero necesito explícame explicame dime cómo cuál cuáles dame ayúdame ayudame the an of to in is are for and or with on how what why do does can you my it please help').split(' '));
      es = [...new Set(String(text).toLowerCase().replace(/[^\p{L}\p{N}\s+#.-]/gu, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)))].slice(0, 7).join(' ');
    }
    if (usaModelo) {
      try {
        const r = await fetch(OLLAMA + '/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000),
          body: JSON.stringify({ model, stream: false, think: false, keep_alive: '10m', options: { temperature: 0, num_predict: 60, num_ctx: 2048 },
            prompt: 'Convierte la pregunta en palabras clave para buscar en una biblioteca técnica. Da 2 a 5 palabras clave GENERALES en español y las mismas en inglés: la pieza o tema y la acción. Omite marcas, modelos, años, saludos y peticiones como "imagen" o "foto". Formato exacto de dos líneas, sin nada más.\n\nPregunta: Mi Nissan Tsuru 2000 humea y pierde potencia, que puede ser?\nES: humo motor perdida potencia diagnostico\nEN: engine smoke power loss diagnosis\n\nPregunta: Como cambio el embrague de un Chevy 2005, tienes fotos?\nES: cambiar embrague clutch\nEN: clutch replacement\n\nPregunta: ' + text.slice(0, 500) + '\nES:' }) });
        if (r.ok) { const t = (await r.json()).response || ''; const full = 'ES:' + t; es = (full.match(/ES:\s*(.+)/i) || [])[1] || ''; en = (full.match(/EN:\s*(.+)/i) || [])[1] || ''; }
      } catch {}
    }
    const qs = [...new Set([es, en].map(x => x.replace(/[^\p{L}\p{N}\s-]/gu, ' ').trim()).filter(x => x.split(/\s+/).length >= 2 && !/^(and|y|en|es)$/i.test(x)))]; if (!qs.length) qs.push(text);
    const lists = []; for (const q of qs) lists.push((await kb('searchall', { q, k })) || []);
    const seen = new Set(), out = [];
    for (let i = 0; i < k; i++) for (const l of lists) { const r = l[i]; if (!r) continue; const key = r.kind === 'zim' ? r.zim + r.zpath : 'p' + r.id; if (seen.has(key)) continue; seen.add(key); out.push(r); }
    return { results: out.slice(0, k), queries: qs };
  },
  'kb:zim': async (zim, p) => kb('zim', { zim, path: p }, 60000),
  'kb:page': async (book, page, w = 900) => kb('page', { book, page, w }, 60000),
  'kb:thumbs': async (zim, p, n = 3) => (await kb('thumbs', { zim, path: p, n }, 30000)) || [],
  'kb:pickFolder': async () => { const r = await dialog.showOpenDialog(win, { title: 'Carpeta de libros a indexar', properties: ['openDirectory'] }); return r.canceled ? null : r.filePaths[0]; },
  'kb:ingest': async folder => { cfg.kbFolders = [...new Set([...(cfg.kbFolders || []), folder])]; saveCfg(); const r = await kbRunIngest(folder); return r; },
  'kb:ocr': async () => kbRunOcr(),
  // ----- herramientas -----
  'tool:status': async () => ({
    ocr: !!toolPath('tesseract', 'tesseract.exe'),
    bgremove: !!(toolPath('quitar_fondo.py') && toolPath('modelos', 'u2net.onnx')),
    convert: !!sofficeExe(),
    image: !!(toolPath('capichad_imagen.py') && imageEnginePython()),
    imageInstaller: !!toolPath('instalar_motor_imagenes.py'),
    dir: outDir()
  }),
  // abre una consola visible que instala el motor de imágenes (~7 GB; necesita Python 3.10-3.13 instalado)
  'tool:installImageEngine': async () => {
    const sc = toolPath('instalar_motor_imagenes.py'); if (!sc) throw new Error('Falta instalar_motor_imagenes.py en la carpeta de herramientas.');
    const py = await findPy();
    if (!py) throw new Error('Necesitas Python 3.10 a 3.13 instalado (https://www.python.org/downloads/windows/). Márcalo "Add python.exe to PATH" y vuelve a intentarlo.');
    spawn('cmd.exe', ['/c', 'start', '"Motor de imagenes de CapiChad"', 'cmd', '/k', `${py[0]} ${py[1]} "${sc}"`], { detached: true, stdio: 'ignore', windowsHide: false }).unref();
    return true;
  },
  // ----- plan recomendado y descargas automáticas -----
  'plan:detect': async () => {
    const { hw, lib, plan } = await buildPlan();
    const sel = plan.items.filter(i => i.selected).map(i => i.id);
    return { hw, plan, selected: sel, totals: PLAN.totals(plan, sel, hw.diskFreeGB), reserveGB: PLAN.RESERVE_GB, mirrors: lib.mirrors };
  },
  'plan:totals': async ids => { const { hw, plan } = await buildPlan(); return PLAN.totals(plan, ids, hw.diskFreeGB); },
  'plan:start': async ids => {
    if (installRun && installRun.running) throw new Error('Ya hay una instalación en curso.');
    if (!Array.isArray(ids) || !ids.length) throw new Error('No hay nada seleccionado.');
    runInstallJob(ids).catch(() => {});      // corre en segundo plano; el avance llega por 'plan:event'
    return true;
  },
  'plan:status': () => {
    const snap = dlm ? dlm.snapshot() : { items: [], total: 0, done: 0, bps: 0, pending: 0 };
    let resumable = null; try { if (!(installRun && installRun.running)) resumable = JSON.parse(fs.readFileSync(planStateFile(), 'utf8')); } catch {}
    return { running: !!(installRun && installRun.running), stage: installRun ? installRun.stage : null, summary: installRun ? installRun.summary : null,
      selection: installRun ? installRun.selection : null, resumable, paused: dlm ? dlm.paused : false, maxMBs: cfg.dlMaxMBs || 0, last: cfg.lastInstall || null,
      items: snap.items.map(i => ({ id: i.id, title: i.title, group: i.group, state: i.state, done: i.done, bytes: i.bytes, bps: i.bps, error: i.error })), total: snap.total, done: snap.done, bps: snap.bps, pending: snap.pending };
  },
  'plan:pause': () => { if (dlm) dlm.pause(); return true; },
  'plan:resume': () => { if (dlm) dlm.resume(); return true; },
  'plan:stop': () => { if (installRun && installRun.running) installRun.ac.abort(); if (dlm) dlm.pause(); return true; },
  'plan:retry': id => { if (dlm) { dlm.retry(id); dlm.resume(); } return true; },
  'plan:speed': mbs => { cfg.dlMaxMBs = Math.max(0, Math.min(1000, +mbs || 0)); saveCfg(); if (dlm) dlm.maxBps = cfg.dlMaxMBs * 1024 * 1024; return cfg.dlMaxMBs; },
  'tool:pickFile': async kind => {
    const f = kind === 'image' ? [{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }] : [{ name: 'Documentos de Office', extensions: ['docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt', 'odt', 'ods', 'odp', 'rtf'] }];
    const r = await dialog.showOpenDialog(win, { title: kind === 'image' ? 'Elegir imagen' : 'Elegir documento', filters: f, properties: ['openFile'] }); return r.canceled ? null : r.filePaths[0];
  },
  'tool:reveal': f => { shell.showItemInFolder(path.resolve(f)); return true; },
  'tool:bgremove': async src => {
    const sc = toolPath('quitar_fondo.py'); if (!sc || !toolPath('modelos', 'u2net.onnx')) throw new Error('La herramienta para quitar fondo no está instalada.');
    const out = uniqueOut(path.basename(src, path.extname(src)) + '_sin_fondo', '.png');
    const r = await runTool(pyExe(), [sc, src, out], 300000); const j = lastJson(r.out);
    if (!j || !j.ok) throw new Error((j && j.errors && j.errors[0]) || r.err.split('\n').pop() || 'No se pudo quitar el fondo.');
    const buf = fs.readFileSync(out);
    return { file: out, seconds: j.seconds, preview: buf.length < 14e6 ? 'data:image/png;base64,' + buf.toString('base64') : null };
  },
  'tool:convert': async (src, fmt = 'pdf') => {
    const so = sofficeExe(); if (!so) throw new Error('LibreOffice no está instalado en este equipo.');
    if (!['pdf', 'docx', 'xlsx', 'txt'].includes(fmt)) throw new Error('Formato no permitido.');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'capichad_lo_'));
    const r = await runTool(so, ['--headless', '--norestore', `-env:UserInstallation=file:///${tmp.replace(/\\/g, '/')}/profile`, '--convert-to', fmt, '--outdir', tmp, src], 300000);
    const made = fs.readdirSync(tmp).find(f => f.toLowerCase().endsWith('.' + fmt));
    if (!made) { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} throw new Error('No se pudo convertir el documento. ' + r.err.split('\n').pop()); }
    const out = uniqueOut(path.basename(made, path.extname(made)), '.' + fmt); fs.copyFileSync(path.join(tmp, made), out);
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
    return { file: out };
  },
  // ----- capacidades y delegación entre modelos -----
  'models:caps': async name => { try { return (await opost('/api/show', { model: name })).capabilities || []; } catch { return []; } },
  // un modelo de visión describe (o responde sobre) las imágenes adjuntas; los modelos de texto reciben esa descripción
  'vision:describe': async (images, question) => {
    const tags = (await oget('/api/tags')).models.map(m => m.name);
    let vm = tags.find(n => /qwen2\.5-?vl|llava|minicpm-v|moondream|vision/i.test(n) && !/-cl:/.test(n));
    if (!vm) { for (const n of tags) { if (/embed|-cl:/.test(n)) continue; try { if ((await opost('/api/show', { model: n })).capabilities?.includes('vision')) { vm = n; break; } } catch {} } }
    if (!vm) throw new Error('No hay ningún modelo que entienda imágenes. Instala uno desde Modelos.');
    const r = await opost('/api/chat', { model: vm, stream: false, keep_alive: '5m', messages: [{ role: 'user', content: (question && question.trim()) || 'Describe esta imagen con detalle: qué muestra, textos visibles, colores y composición.', images }], options: { temperature: 0.2, num_ctx: 4096, num_predict: 700 } });
    return { model: vm, text: String(r?.message?.content || '').trim() };
  },
  // quitar fondo de una imagen que viene del chat (base64)
  'tool:bgremoveB64': async b64 => {
    const tmp = path.join(os.tmpdir(), `capichad_in_${Date.now()}.png`); fs.writeFileSync(tmp, Buffer.from(b64, 'base64'));
    try {
      const sc = toolPath('quitar_fondo.py'); if (!sc || !toolPath('modelos', 'u2net.onnx')) throw new Error('La herramienta para quitar fondo no está instalada.');
      const out = uniqueOut('imagen_sin_fondo', '.png'); const r = await runTool(pyExe(), [sc, tmp, out], 300000); const j = lastJson(r.out);
      if (!j || !j.ok) throw new Error((j && j.errors && j.errors[0]) || 'No se pudo quitar el fondo.');
      return { file: out };
    } finally { try { fs.unlinkSync(tmp); } catch {} }
  },
  // ----- imágenes: generación con galería propia -----
  'img:generate': async (prompt, o = {}) => {
    const sc = toolPath('capichad_imagen.py'); if (!sc) throw new Error('El generador de imágenes no está instalado.');
    const n = Math.max(1, Math.min(4, parseInt(o.n) || 1)), w = parseInt(o.w) || 512, hh = parseInt(o.h) || 512, stamp = Date.now();
    const tmp = path.join(os.tmpdir(), 'capichad_gen_' + stamp); fs.mkdirSync(tmp, { recursive: true });
    const p = String(prompt).slice(0, 500);
    const args = [sc, ...Array(n).fill(p), '-o', n === 1 ? path.join(tmp, 'imagen_01.jpg') : tmp, '--width', String(w), '--height', String(hh)];
    if (o.seed !== undefined && o.seed !== null && o.seed !== '') args.push('--seed', String(parseInt(o.seed)));
    if (o.translate) args.push('--traducir');
    if (o.ref && fs.existsSync(o.ref)) args.push('--ref', o.ref, '--strength', String(Math.min(0.95, Math.max(0.2, Number(o.strength) || 0.6))));
    const r = await runTool(pyExe(), args, 1800000); const j = lastJson(r.out);
    if (!j || !j.files || !j.files.length) { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} throw new Error((j && j.errors && j.errors[0]) || r.err.split('\n').pop() || 'No se pudo generar la imagen.'); }
    const dir = D('imagenes'); fs.mkdirSync(dir, { recursive: true }); const items = [];
    j.files.forEach((f, i) => {
      const dest = path.join(dir, `img_${stamp}_${i + 1}.jpg`); fs.copyFileSync(f, dest);
      writeJson(dest.replace(/\.jpg$/, '.json'), { prompt: p, used: (j.prompts || [])[i] || p, w, h: hh, seed: o.seed ?? null, date: stamp, ref: !!o.ref });
      items.push({ file: dest, thumb: nativeImage.createFromPath(dest).resize({ width: 512 }).toDataURL() });
    });
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
    return { items, seconds: j.seconds, used: (j.prompts || [])[0] || p };
  },
  'img:list': () => {
    const dir = D('imagenes'); if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter(f => f.endsWith('.jpg')).map(f => { const file = path.join(dir, f); const m = readJson(file.replace(/\.jpg$/, '.json'), {}); return { file, name: f, prompt: m.prompt || '', used: m.used || '', w: m.w, h: m.h, date: m.date || fs.statSync(file).mtimeMs }; }).sort((a, b) => b.date - a.date).slice(0, 80);
  },
  'img:thumb': (file, width = 320) => { const f = path.resolve(file); if (!okImg(f)) return null; try { return nativeImage.createFromPath(f).resize({ width }).toDataURL(); } catch { return null; } },
  'img:view': file => { const f = path.resolve(file); if (!okImg(f)) return null; const b = fs.readFileSync(f); return b.length < 12e6 ? `data:image/${/\.png$/i.test(f) ? 'png' : 'jpeg'};base64,` + b.toString('base64') : null; },
  'img:delete': file => { const f = path.resolve(file); if (!f.startsWith(path.resolve(D('imagenes')))) return false; for (const p of [f, f.replace(/\.jpg$/, '.json')]) { try { fs.unlinkSync(p); } catch {} } return true; },
  'tool:imagegen': async (prompt, w = 512, h = 512, translate = false) => {
    const sc = toolPath('capichad_imagen.py'); if (!sc) throw new Error('El generador de imágenes no está instalado.');
    const out = uniqueOut('imagen', '.jpg');
    const args = [sc, String(prompt).slice(0, 500), '-o', out, '--width', String(w), '--height', String(h)]; if (translate) args.push('--traducir');
    const r = await runTool(pyExe(), args, 900000); const j = lastJson(r.out);
    if (!j || !j.ok) throw new Error((j && j.errors && j.errors[0]) || r.err.split('\n').pop() || 'No se pudo generar la imagen.');
    const buf = fs.readFileSync(out);
    return { file: out, seconds: j.seconds, preview: 'data:image/jpeg;base64,' + buf.toString('base64') };
  },
  'kb:openBook': p => { if (p && fs.existsSync(p)) shell.openPath(p); return true; },
  // carpeta donde se copian los archivos .zim (Wikipedia, DevDocs, Stack Exchange…)
  'kb:libFolder': () => { const d = path.join(KB_HOME, 'biblioteca'); try { fs.mkdirSync(d, { recursive: true }); } catch {} return d; },
  'kb:openLibFolder': () => { const d = path.join(KB_HOME, 'biblioteca'); try { fs.mkdirSync(d, { recursive: true }); } catch {} shell.openPath(d); return d; },
  // internet (opcional): con conexión la IA se apoya en la web; sin ella todo sigue funcionando en local
  'web:status': async () => ({ online: await webOnline(), mode: cfg.webMode || 'auto' }),
  'web:ask': async (q, o = {}) => {
    if (cfg.webMode === 'never' || !(await webOnline())) return { online: false, results: [] };
    const r = await webRun([o.code ? 'code' : 'answer', String(q).slice(0, 300), '-k', '2'], 45000);
    return { online: true, results: (Array.isArray(r) ? r : []).map(x => ({ kind: 'web', title: x.title, url: x.url, topic: x.topic || 'Internet', text: String(x.text || '').slice(0, 1500) })) };
  },
  'web:images': async (q, n = 8) => { if (!(await webOnline())) throw new Error('Sin conexión a internet.'); const r = await webRun(['images', String(q).slice(0, 200), '-n', String(n), '--embed'], 90000); return Array.isArray(r) ? r : []; },
  'web:useImage': async url => { const dest = uniqueOut('referencia_web', '.jpg'); await webRun(['download', String(url), dest], 90000); return dest; },
  'web:open': u => { if (/^https?:\/\//i.test(String(u))) shell.openExternal(String(u)); return true; },
  // modo Programar (bucle propio, ver prog.js): el modelo propone archivos; el sistema los escribe, verifica y reporta
  'prog:pickFolder': async () => { const r = await dialog.showOpenDialog(win, { title: 'Carpeta del proyecto', properties: ['openDirectory', 'createDirectory'] }); return r.canceled ? null : r.filePaths[0]; },
  'prog:info': folder => {
    if (!folder || !fs.existsSync(folder)) return null;
    const sc = PROG.scanProject(folder);
    return { files: sc.files.length, tree: sc.tree.split('\n').slice(0, 14).join('\n'), runs: PROG.listRuns(folder), recent: cfg.progRecent || [] };
  },
  'prog:recent': () => (cfg.progRecent || []).filter(f => fs.existsSync(f)),
  'prog:run': async o => {
    if (progRun) throw new Error('Ya hay una ejecución en curso.');
    if (!(await ensureServer())) throw new Error('Ollama no está disponible.');
    const folder = path.resolve(String(o.folder || '')); const ac = new AbortController(); progRun = { ac };
    cfg.progRecent = [folder, ...(cfg.progRecent || []).filter(f => f !== folder)].slice(0, 6); saveCfg();
    const emit = e => send('prog:event', e);
    try {
      return await PROG.runProgram({
        folder, task: String(o.task || ''), model: o.model, verifyCmd: o.verifyCmd || '', maxIter: o.maxIter || 3, py: pyExe(), signal: ac.signal, emit,
        chat: progChat,
        gatherSources: async task => {
          const out = [];
          if (o.library !== false && cfg.useKnowledge !== false) { try { (await kb('searchall', { q: task.slice(0, 240), k: 3 }, 20000) || []).slice(0, 3).forEach(r => out.push({ title: r.title, text: r.text, url: null })); } catch {} }
          if (o.web === 'always' || (o.web !== 'never' && cfg.webMode !== 'never' && /\b(versi[oó]n|[uú]ltim[oa]s?|actual|api de|librer[ií]a|latest|nuev[oa])\b/i.test(task))) {
            try { if (await webOnline()) (await webRun(['code', task.slice(0, 200), '-k', '2'], 45000)).forEach(r => out.push({ title: r.title, text: r.text, url: r.url })); } catch {}
          }
          return out;
        },
        // primer fallo: busca la línea del error en la biblioteca y, si hay conexión, en internet (Stack Overflow)
        lookupError: async (output, task) => {
          const lines = String(output).split('\n').map(l => l.trim()).filter(Boolean);
          const err = [...lines].reverse().find(l => /(Error|Exception|Traceback|failed|not found|cannot|No module)/i.test(l)) || lines[lines.length - 1] || '';
          const q = err.replace(/["'][^"']{0,80}["']/g, ' ').replace(/[A-Za-z]:\\[^\s]+/g, ' ').slice(0, 160).trim(); if (q.length < 6) return [];
          const out = [];
          try { (await kb('searchall', { q, k: 2 }, 15000) || []).slice(0, 2).forEach(r => out.push({ title: r.title, text: r.text, url: null })); } catch {}
          if (o.web !== 'never' && cfg.webMode !== 'never') { try { if (await webOnline()) (await webRun(['code', q + ' python', '-k', '2'], 45000)).forEach(r => out.push({ title: r.title, text: r.text, url: r.url })); } catch {} }
          return out;
        },
        // las imágenes usan la GPU completa: se descarga antes el modelo de lenguaje
        makeImage: async ({ prompt, dest, w, h }) => {
          const sc = toolPath('capichad_imagen.py'); if (!sc) return { ok: false, error: 'El generador de imágenes no está instalado.' };
          try { await opost('/api/generate', { model: o.model, keep_alive: 0 }); } catch {}
          const r = await runTool(pyExe(), [sc, prompt, '-o', dest, '--width', String(Math.min(768, w || 512)), '--height', String(Math.min(768, h || 512)), '--traducir'], 1800000);
          const j = lastJson(r.out); return j && j.files && j.files.length ? { ok: true } : { ok: false, error: (j && j.errors && j.errors[0]) || 'sin imagen' };
        }
      });
    } finally { progRun = null; }
  },
  'prog:stop': () => { progRun && progRun.ac.abort(); return true; },
  'prog:undo': (folder, id) => PROG.undoRun(folder, id),
  'prog:open': folder => { if (folder && fs.existsSync(folder)) shell.openPath(folder); return true; },
  // ajustes
  'cfg:get': () => cfg,
  'cfg:set': patch => { cfg = { ...cfg, ...patch }; if (patch && 'ollamaHost' in patch) applyOllamaHost(cfg.ollamaHost); saveCfg(); return cfg; },
  'cfg:pickFolder': async () => { const r = await dialog.showOpenDialog(win, { title: 'Carpeta de datos', properties: ['openDirectory', 'createDirectory'] }); return r.canceled ? null : r.filePaths[0]; },
  'cfg:moveData': dest => { const from = cfg.dataDir; fs.mkdirSync(dest, { recursive: true }); fs.cpSync(from, dest, { recursive: true }); cfg.dataDir = dest; saveCfg(); ensureDirs(); chunkCache.clear(); return cfg; },
  'backup:export': async () => { const r = await dialog.showOpenDialog(win, { title: 'Dónde guardar la copia', properties: ['openDirectory', 'createDirectory'] }); if (r.canceled) return null; const d = path.join(r.filePaths[0], 'CapiChad copia ' + new Date().toISOString().slice(0, 10)); fs.cpSync(cfg.dataDir, d, { recursive: true }); return d; },
  'backup:import': async () => { const r = await dialog.showOpenDialog(win, { title: 'Elegir carpeta de la copia', properties: ['openDirectory'] }); if (r.canceled) return null; fs.cpSync(r.filePaths[0], cfg.dataDir, { recursive: true }); chunkCache.clear(); return r.filePaths[0]; },
  'app:openData': () => { shell.openPath(cfg.dataDir); return true; },
  // enlace de donaciones: un solo valor (package.json > capibara.donate); solo https y plataformas conocidas
  'app:donate': () => donateUrl(),
  'app:openDonate': () => { const u = donateUrl(); if (u) shell.openExternal(u); return !!u; },
  'app:openExternal': u => { if (/^https:\/\/(ollama\.com|huggingface\.co)\//.test(u)) shell.openExternal(u); return true; }
};
function friendly(m) {
  if (/allocate|memory|CUDA_Host/i.test(m)) return 'No hay memoria suficiente para cargar este modelo.⁠​‌​​​​‌‌​‌​‌​​​​​‌​​​​‌​​​‌​‌‌​‌​​‌‌​‌​‌​​‌‌​​​‌​​‌‌​​‌‌​‌‌​​​‌​​​‌‌​​​‌​​‌‌​​‌‌​‌‌​​​‌‌​​‌‌​​‌​⁠ Cierra otras aplicaciones o elige un modelo más ligero.';
  if (/not found|no such model/i.test(m)) return 'El modelo no está instalado.';
  return m;
}
function seedAssistants() {
  const l = [
    { id: uid(), name: 'Asistente general', desc: 'Conversa y resuelve dudas cotidianas.', model: '', instructions: 'Responde en español de forma clara y directa. Si no sabes algo, dilo.', style: 'Claro y detallado', creativity: 50, useDocs: false, builtin: true },
    { id: uid(), name: 'Programador', desc: 'Revisa código y resuelve dudas.', model: '', instructions: 'Eres un programador experto. Responde en español con código correcto y breves explicaciones. Muestra el código en bloques. Si falta información, pregunta.', style: 'Técnico', creativity: 20, useDocs: false },
    { id: uid(), name: 'Tutor', desc: 'Explica temas paso a paso.', model: '', instructions: 'Eres un tutor paciente. Explica el tema paso a paso con ejemplos sencillos y comprueba la comprensión con una pregunta al final.', style: 'Claro y detallado', creativity: 35, useDocs: false },
    { id: uid(), name: 'Tutor de Python', desc: 'Aprende Python con ejemplos sencillos.', model: '', instructions: 'Explica los conceptos paso a paso.\nUsa ejemplos cortos en Python.\nHaz una pregunta para comprobar la comprensión.', style: 'Claro y detallado', creativity: 30, useDocs: false },
    { id: uid(), name: 'Redactor', desc: 'Redacta y mejora tus textos.', model: '', instructions: 'Eres un editor en español. Mejora la redacción conservando el significado y el tono del autor. Señala los cambios importantes.', style: 'Breve', creativity: 60, useDocs: false },
    { id: uid(), name: 'Mis documentos', desc: 'Responde solo con base en tus archivos.', model: '', instructions: 'Responde únicamente con la información de los fragmentos. Si la respuesta no está en ellos, dilo claramente.', style: 'Claro y detallado', creativity: 10, useDocs: true }
  ];
  writeJson(D('assistants.json'), l); return l;
}

function donateUrl() {
  try {
    const u = String(require('./package.json').capibara.donate || '').trim(); const x = new URL(u);
    return x.protocol === 'https:' && /(^|\.)(ko-fi\.com|paypal\.me|paypal\.com|buymeacoffee\.com|liberapay\.com|github\.com|patreon\.com|mercadopago\.com\.mx)$/i.test(x.hostname) ? x.href : '';
  } catch { return ''; }
}

// ---------- ventana ----------
function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 980, minHeight: 620, frame: false, backgroundColor: '#0a101c', show: false,
    icon: path.join(__dirname, 'assets', 'icon.png'), title: 'CapiChad',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false }
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.once('ready-to-show', () => { if (!process.env.IA_SHOT) win.show(); });
  win.on('maximize', () => send('win:state', true)); win.on('unmaximize', () => send('win:state', false));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  if (process.env.IA_EVAL) evalRun(process.env.IA_EVAL);
  else if (process.env.IA_SHOT) screenshotRun(process.env.IA_SHOT);
}
// modo de pruebas: ejecuta un script en la interfaz y guarda el resultado
async function evalRun(file) {
  await new Promise(r => win.webContents.once('did-finish-load', r)); await new Promise(r => setTimeout(r, 1500));
  let out; try { out = await win.webContents.executeJavaScript(`(async()=>{${fs.readFileSync(file, 'utf8')}})()`); } catch (e) { out = { evalError: String(e) }; }
  fs.writeFileSync(file + '.out.json', JSON.stringify(out, null, 2));
  if (process.env.IA_SHOT) { await new Promise(r => setTimeout(r, 800)); fs.mkdirSync(process.env.IA_SHOT, { recursive: true }); fs.writeFileSync(path.join(process.env.IA_SHOT, 'eval.png'), (await win.webContents.capturePage()).toPNG()); }
  app.quit();
}
async function screenshotRun(dir) {
  fs.mkdirSync(dir, { recursive: true });
  await new Promise(r => win.webContents.once('did-finish-load', r)); await new Promise(r => setTimeout(r, 1800));
  const views = (process.env.IA_VIEWS || 'home,history,models,documents,assistants,settings,performance').split(',');
  for (const v of views) {
    await win.webContents.executeJavaScript(`window.__go && window.__go(${JSON.stringify(v)})`);
    await new Promise(r => setTimeout(r, 1500));
    const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(dir, v.replace(/[^\w-]/g, '_') + '.png'), img.toPNG());
  }
  app.quit();
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => {
    loadCfg(); applyCfgHost(); ensureDirs();
    for (const [k, fn] of Object.entries(H)) ipcMain.handle(k, async (_e, ...a) => { try { return await fn(...a); } catch (e) { throw new Error(friendly(e.message)); } });
    createWindow();
    ensureServer();
  });
  app.on('window-all-closed', () => app.quit());
}
