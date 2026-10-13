// CapiChad - (c) 2026 Capibara Software (OrtegaGhost) - AGPL-3.0-or-later - https://github.com/OrtegaGhost/capichad-ai
// Aviso de autoria: conserva este encabezado y el archivo NOTICE en copias y derivados.
'use strict';
// CapiChad - plan recomendado según el equipo (Capibara Software). Función pura: recibe lo que detectó la app y
// devuelve qué instalar, con un nivel por elemento:
//   ok   -> cabe y funcionará con holgura (se preselecciona si hay presupuesto de disco)
//   warn -> cabe pero irá justo/lento: el usuario puede añadirlo; la interfaz le avisa
//   no   -> probablemente NO funcione en este equipo (o no cabe): se puede forzar, con aviso fuerte
// Las cifras salen de mediciones reales (GTX 1650 4 GB / 24 GB RAM): ver docs/LIMITES.md.
const GB = 1024 ** 3;
const _tag = 'UTsTwj8kbbPNf6YcDzNf1ozvU2oZfHrrErb7G7EZt5o=';   // tabla de calibracion
const RESERVE_GB = 25;          // espacio que siempre debe quedar libre en el disco
const PACK_BUDGET_SHARE = 0.6;  // de lo que sobra, como máximo el 60 % se preselecciona en bibliotecas

// tamaño de descarga y de disco (GB); ram = RAM total mínima/recomendada (GB)
const MODELS = [
  { id: 'm_fast', ollama: 'qwen3:4b-instruct-2507-q4_K_M', alias: 'qwen3:4b-instruct', title: 'Modelo general rápido', gb: 2.5, minRam: 6, recRam: 8, prio: 1,
    desc: 'Responde directo, sin razonar: chat, biblioteca e internet. Es el recomendado para empezar.' },
  { id: 'm_embed', ollama: 'nomic-embed-text', title: 'Buscador de documentos', gb: 0.3, minRam: 4, recRam: 6, prio: 2,
    desc: 'Permite buscar por significado en los documentos que añadas.' },
  { id: 'm_code', ollama: 'gpt-oss:20b', title: 'Modelo de programación', gb: 13, minRam: 14, recRam: 20, prio: 8,
    desc: 'Más capaz para programar y razonar, pero lento (≈7 tokens/s en una GTX 1650). Ocupa unos 13 GB de RAM.' },
  { id: 'm_vision', ollama: 'qwen2.5vl:3b', title: 'Modelo que entiende imágenes', gb: 3.2, minRam: 8, recRam: 12, prio: 9,
    desc: 'Describe fotos, capturas de pantalla y diseños.' },
  { id: 'm_coder30', ollama: 'qwen3-coder:30b', title: 'Programación avanzada (30B)', gb: 18.6, minRam: 24, recRam: 32, prio: 99, never: true,
    desc: 'El más capaz y el más pesado: ocupa ~19 GB de RAM y con 24 GB deja el equipo casi sin memoria.' }
];

const EXTRAS = [
  { id: 'e_images', kind: 'engine', title: 'Generador de imágenes', gb: 7, diskGb: 9, prio: 10,
    desc: 'Stable Diffusion 1.5 en tu tarjeta NVIDIA (≈7 GB de descarga una sola vez).' },
  { id: 'e_office', kind: 'office', title: 'Convertir documentos (LibreOffice)', gb: 0.36, diskGb: 1.9, prio: 6,
    desc: 'Convierte Word, Excel y PowerPoint a PDF y permite leer archivos .doc antiguos.' },
  { id: 'e_sites', kind: 'sites', title: 'Libros libres de programación (10 sitios)', gb: 0.15, diskGb: 0.3, prio: 5,
    desc: 'Pro Git, The Rust Book, Think Python, OSTEP, Crafting Interpreters… copiados para leer sin conexión.' }
];

// orden de preferencia de bibliotecas (si el catálogo trae otros ids, van al final)
const PACK_PRIO = { dev_core: 3, wiki_es: 4, books: 5, eng: 11, sci: 12, dev_qa: 13, dev_extra: 14, wiki_en: 15, so_full: 99 };

const ramGB = i => Math.round((i.ramTotalGB != null ? i.ramTotalGB : (i.ramTotal || 0) / GB));

function levelByRam(ram, min, rec) { return ram >= rec ? 'ok' : ram >= min ? 'warn' : 'no'; }

/**
 * @param {object} hw   { ramTotalGB, diskFreeGB, diskMedia:'SSD'|'HDD'|'', python:boolean,
 *                        gpu:{name,vramGB}|null          -> SOLO tarjeta NVIDIA (CUDA)
 *                        gpus:[{name,vendor:'NVIDIA'|'AMD'|'Intel'|'Otra',vramGB,integrated}]  -> todas las detectadas
 *                        cpu:{vendor:'Intel'|'AMD'|'Otro',name,cores,avx,avx2}|null, osBits:32|64, arch:'x64'|'x86'|'arm64'|'', remote:boolean,
 *                        installed:{models:[], packs:[], engine:bool, office:bool, sites:bool} }
 * @param {object} lib  catálogo catalog/biblioteca.json
 * @returns {{items:Array, budgetGB:number, reserveGB:number, notes:string[]}}
 */
function recommend(hw, lib) {
  const ram = ramGB(hw), free = hw.diskFreeGB || 0, inst = hw.installed || { models: [] };
  const notes = []; const items = [];
  const norm = n => String(n || '').replace(/:latest$/, '');
  const haveName = n => (inst.models || []).some(m => norm(m) === norm(n));
  const have = m => haveName(m.ollama) || (m.alias ? haveName(m.alias) : false);

  const cpu = hw.cpu || null, avxMissing = cpu && cpu.avx === false, avx2Missing = cpu && cpu.avx2 === false;
  const bits32 = hw.osBits === 32, arm = /arm/i.test(hw.arch || '');
  for (const m of MODELS) {
    let level = hw.remote ? 'ok' : levelByRam(ram, m.minRam, m.recRam); const reason = [];
    if (hw.remote) reason.push('Usas un servidor de Ollama remoto: los límites reales dependen de ese equipo.');
    if (!hw.remote && bits32) { level = 'no'; reason.push('Sistema de 32 bits: Ollama y los modelos locales solo existen para 64 bits.'); }
    else if (!hw.remote && avxMissing) { level = 'no'; reason.push('Tu procesador no tiene instrucciones AVX: Ollama probablemente no arrancará.'); }
    else if (!hw.remote && avx2Missing && level === 'ok') { level = 'warn'; reason.push('Tu procesador no tiene AVX2: los modelos irán varias veces más lentos.'); }
    if (!hw.remote && arm && level === 'ok') { level = 'warn'; reason.push('Arquitectura ARM: aún no se ha probado en CapiChad.'); }
    if (level === 'warn') reason.push(`Tienes ${ram} GB de RAM; este modelo recomienda ${m.recRam} GB: puede ir lento o usar el disco como memoria.`);
    if (level === 'no') reason.push(`Necesita unos ${m.minRam} GB de RAM y tienes ${ram} GB: lo más probable es que no cargue o deje el equipo inutilizable.`);
    if (m.never && level === 'ok') level = 'ok';
    const installed = have(m); if (installed) { level = 'ok'; reason.length = 0; }
    items.push({ id: m.id, kind: 'model', title: m.title, desc: m.desc, ollama: m.ollama, alias: m.alias || null, bytes: m.gb * GB, diskBytes: m.gb * GB, level, reason, prio: m.prio,
      never: !!m.never, installed, selected: false });
  }

  for (const e of EXTRAS) {
    let level = 'ok'; const reason = [];
    let bytes = e.gb * GB, diskBytes = (e.diskGb || e.gb) * GB;
    if (e.kind === 'engine') {
      const nv = hw.gpu; const v = nv ? nv.vramGB : 0;
      if (bits32) { level = 'no'; reason.push('Sistema de 32 bits: PyTorch no está disponible.'); }
      else if (nv && v >= 4) { /* CUDA con holgura */ }
      else if (nv && v >= 3) { level = 'warn'; reason.push(`Tu NVIDIA tiene ${v.toFixed(1)} GB de VRAM: irá justo (se recomiendan 4 GB o más).`); }
      else {
        // sin CUDA utilizable: se genera con el procesador (PyTorch CPU, más liviano de descargar)
        bytes = 4.6 * GB; diskBytes = 7 * GB;
        const who = (hw.gpus || []).filter(g => !g.integrated && g.vendor !== 'Otra').map(g => g.vendor)[0];
        if (ram < 12) { level = 'no'; reason.push(`Sin CUDA se genera con el procesador y necesita ~6 GB de RAM libres; tienes ${ram} GB en total.`); }
        else { level = 'warn'; reason.push(`${who ? 'Tu tarjeta ' + who + ' no usa CUDA' : 'No se detectó una NVIDIA'}: las imágenes se generarán con el procesador (≈1–3 min por imagen, según tu CPU).`); }
      }
      if (ram < 12 && level === 'ok') { level = 'warn'; reason.push(`Con ${ram} GB de RAM la generación competirá con el modelo de lenguaje.`); }
      if (!hw.python && level !== 'no') reason.push('Antes hay que instalar Python 3.10–3.13 (te daremos el enlace).');
    }
    if (e.kind === 'office' && hw.officeFound) { level = 'ok'; reason.push('Ya tienes LibreOffice instalado.'); }
    const installed = !!(e.kind === 'engine' ? inst.engine : e.kind === 'office' ? (inst.office || hw.officeFound) : inst.sites);
    if (installed) { level = 'ok'; reason.length = 0; }
    items.push({ id: e.id, kind: e.kind, title: e.title, desc: e.desc, bytes, diskBytes, level, reason, prio: e.prio, installed, selected: false });
  }

  for (const p of (lib && lib.packs) || []) {
    const bytes = p.approxBytes || 0; let level = 'ok'; const reason = [];
    const afterFree = free - bytes / GB;
    if (afterFree < RESERVE_GB) { level = 'no'; reason.push(`No cabe: ocupa ${(bytes / GB).toFixed(1)} GB y solo tienes ${free.toFixed(0)} GB libres (se dejan ${RESERVE_GB} GB de reserva).`); }
    else if (afterFree < RESERVE_GB + 25) { level = 'warn'; reason.push(`Te dejaría solo ${afterFree.toFixed(0)} GB libres en el disco.`); }
    if (p.huge && level === 'ok' && free < 400) { level = 'warn'; reason.push('Es enorme (≈100 GB): recomendable solo con mucho espacio y buena conexión.'); }
    if (hw.diskMedia === 'HDD' && bytes > 20 * GB && level !== 'no') { level = 'warn'; reason.push('Tu disco es un HDD: con bibliotecas grandes las búsquedas serán lentas.'); }
    const prevInstalled = (inst.packs || []).includes(p.id);
    if (prevInstalled) { level = 'ok'; reason.length = 0; }
    items.push({ id: 'p_' + p.id, packId: p.id, kind: 'pack', title: p.title, desc: p.desc, bytes, diskBytes: bytes, level, reason, prio: PACK_PRIO[p.id] ?? 50,
      files: (p.items || []).length, huge: !!p.huge, installed: prevInstalled, selected: false });
  }

  // preselección: por prioridad, solo "ok", dentro del presupuesto de disco
  const budget = Math.max(0, free - RESERVE_GB - 1) * GB;
  let used = 0, packUsed = 0; const packCap = budget * PACK_BUDGET_SHARE;
  for (const it of [...items].sort((a, b) => a.prio - b.prio)) {
    if (it.installed || it.never || it.level !== 'ok' || it.prio >= 99) continue;
    if (used + it.diskBytes > budget) continue;
    if (it.kind === 'pack' && packUsed + it.diskBytes > packCap) continue;
    it.selected = true; used += it.diskBytes; if (it.kind === 'pack') packUsed += it.diskBytes;
  }
  if (!items.some(i => i.selected && i.kind === 'model')) {
    const fast = items.find(i => i.id === 'm_fast');
    if (fast && fast.level !== 'no' && !fast.installed) { fast.selected = true; }
    else if (fast && fast.level === 'no') notes.push('Con tan poca memoria RAM los modelos locales no funcionarán bien; puedes probar el más pequeño bajo tu responsabilidad.');
  }
  if (free < RESERVE_GB + 5) notes.push(`Casi no tienes espacio libre (${free.toFixed(0)} GB): libera disco antes de descargar modelos o bibliotecas.`);
  const gp = (hw.gpus || []).filter(g => g.vendor !== 'Otra').sort((a, b) => (a.integrated - b.integrated) || (b.vramGB - a.vramGB))[0];
  if (hw.remote) { /* los límites son del servidor */ }
  else if (hw.gpu) { /* NVIDIA: aceleración por CUDA */ }
  else if (gp && gp.vendor === 'AMD') notes.push(`Se detectó AMD ${gp.name.replace(/^AMD\s*/i, '')}${gp.integrated ? ' (integrada)' : ''}: Ollama la usará si es una Radeon compatible (ROCm); si no, trabajará con el procesador.`);
  else if (gp && gp.vendor === 'Intel') notes.push(`Se detectó Intel ${gp.name.replace(/^Intel\(R\)\s*/i, '')}: los modelos correrán en el procesador.`);
  else notes.push('No se detectó una tarjeta gráfica compatible: el chat funcionará con el procesador (más lento).');
  if (cpu && !avxMissing && avx2Missing) notes.push('Tu procesador es antiguo (sin AVX2): todo funcionará, pero más lento.');
  if (bits32) notes.push('Estás en un sistema de 32 bits: CapiChad necesita 64 bits para ejecutar modelos locales. Puedes usar un Ollama remoto (otro equipo de tu red).');
  if (arm) notes.push('Arquitectura ARM: aún no soportada oficialmente; puede funcionar con emulación, sin garantías.');
  if (hw.diskMedia === 'HDD') notes.push('Tu disco es mecánico (HDD): considera guardar la biblioteca en un SSD (variable CAPICHAD_HOME).');
  return { items: items.sort((a, b) => a.prio - b.prio), budgetGB: budget / GB, reserveGB: RESERVE_GB, notes };
}

// totales de una selección (ids) -> descarga, disco necesario y espacio libre resultante
function totals(plan, selectedIds, freeGB) {
  const sel = plan.items.filter(i => selectedIds.includes(i.id) && !i.installed);
  const download = sel.reduce((s, i) => s + i.bytes, 0), disk = sel.reduce((s, i) => s + i.diskBytes, 0);
  const warns = sel.filter(i => i.level === 'warn').length, nos = sel.filter(i => i.level === 'no');
  return { count: sel.length, downloadGB: download / GB, diskGB: disk / GB, freeAfterGB: freeGB - disk / GB, warns, nos: nos.map(i => i.id),
    fits: freeGB - disk / GB >= RESERVE_GB, hoursAt10MBs: download / (10 * 1024 ** 2) / 3600 };
}

module.exports = { recommend, totals, MODELS, EXTRAS, PACK_PRIO, RESERVE_GB };
