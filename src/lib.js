// CapiChad - (c) 2026 Capibara Software (OrtegaGhost) - AGPL-3.0-or-later - https://github.com/OrtegaGhost/capichad-ai
// Aviso de autoria: conserva este encabezado y el archivo NOTICE en copias y derivados.
// utilidades de interfaz
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const invoke = async (n, ...a) => { try { return await window.api.invoke(n, ...a); } catch (e) { throw new Error(String(e.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); } };

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5V21H3z"/><path d="M9 21v-7h6v7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  file: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  clip: '<path d="M21 12.5l-8.5 8.5a5 5 0 0 1-7-7L14 5.5a3.3 3.3 0 0 1 4.7 4.7L10.2 18.7a1.7 1.7 0 0 1-2.4-2.4L15 9"/>',
  send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  dots: '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5"/>',
  right: '<path d="M9 6l6 6-6 6"/>', left: '<path d="M15 6l-6 6 6 6"/>',
  wifioff: '<path d="M2 2l20 20M8.5 16.4a5 5 0 0 1 7 0M2 8.8a15 15 0 0 1 4.2-2.7M10.7 5.1A15 15 0 0 1 22 8.8M5 12.9a10 10 0 0 1 5.2-2.7M19 12.9a10 10 0 0 0-2.8-1.9M12 20h.01"/>',
  wifi: '<path d="M2 8.8a15 15 0 0 1 20 0M5 12.9a10 10 0 0 1 14 0M8.5 16.4a5 5 0 0 1 7 0M12 20h.01"/>',
  disk: '<rect x="3" y="13" width="18" height="7" rx="2"/><path d="M3 13l3-8h12l3 8M7 16.5h.01"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  gpu: '<rect x="2" y="7" width="20" height="10" rx="2"/><circle cx="9" cy="12" r="2.5"/><circle cx="16" cy="12" r="2.5"/><path d="M5 20h14"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  alert: '<path d="M12 3 2 21h20z"/><path d="M12 10v5M12 18h.01"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14-4L4 9M4 4v5h5M4 13a8 8 0 0 0 14 4l2-2M20 20v-5h-5"/>',
  folder: '<path d="M3 6a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  upload: '<path d="M12 15V3M7 8l5-5 5 5M4 21h16"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  code: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>',
  pencil: '<path d="M4 20l1-4L17 4l3 3L8 19z"/>',
  grad: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  book: '<path d="M4 4h6a3 3 0 0 1 2 1 3 3 0 0 1 2-1h6v14h-6a3 3 0 0 0-2 1 3 3 0 0 0-2-1H4z"/><path d="M12 5v14"/>',
  pin: '<path d="M9 3h6l-1 6 3 4H7l3-4z"/><path d="M12 13v8"/>',
  tool: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.4 2.4-2.4-.6-.6-2.4z"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 9"/>'
};

// Nombres amigables: lo que ve la persona en lugar del nombre técnico del modelo.
const FRIENDLY = [
  [/qwen3-coder/i, { name: 'Modelo de programación avanzada', desc: 'Para proyectos de código grandes: el más capaz, pero también el más lento.' }],
  [/gpt-oss/i, { name: 'Modelo de programación', desc: 'Escribe, explica y corrige código; razona paso a paso.' }],
  [/qwen2\.5-?vl|llava|minicpm-v|vision/i, { name: 'Modelo que entiende imágenes', desc: 'Describe fotos, capturas de pantalla y diseños.' }],
  [/embed|bge|minilm/i, { name: 'Buscador de documentos', desc: 'Trabaja por detrás para encontrar información en tus archivos.' }],
  [/uncensor|aggressive|hauhau/i, { name: 'Modelo para crear documentos (sin filtros)', desc: 'Redacta textos, resúmenes e informes sin restricciones. También entiende imágenes.' }],
  [/dolphin/i, { name: 'Modelo de conversación libre', desc: 'Charla abierta y creativa, sin filtros.' }],
  [/gemma/i, { name: 'Modelo para crear documentos', desc: 'Redacta textos, resúmenes e informes. También entiende imágenes.' }],
  [/phi4|phi3/i, { name: 'Modelo ligero', desc: 'Respuestas rápidas; ideal para equipos modestos.' }],
  [/qwen3.*instruct/i, { name: 'Modelo general rápido', desc: 'Responde directo, sin razonar: el más ágil para preguntas, biblioteca e internet.' }],
  [/qwen3|qwen2|llama|mistral/i, { name: 'Modelo general', desc: 'Conversación y tareas cotidianas; razona paso a paso, por eso tarda más.' }]
];
const technicalName = n => String(n || '').replace(/^[^/]+\//, '').replace(/:latest$/, '');
const friendly = n => { const hit = FRIENDLY.find(([re]) => re.test(n || '')); return hit ? hit[1] : { name: technicalName(n), desc: '' }; };
const icon = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24">${ICONS[n] || ''}</svg>`;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v);
  }
  kids.flat().forEach(c => c != null && e.append(c.nodeType ? c : document.createTextNode(c)));
  return e;
}
const bytes = n => { if (!n) return '0 B'; const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0; while (n >= 1024 && i < 4) { n /= 1024; i++; } return (n >= 100 || i === 0 ? n.toFixed(0) : n.toFixed(1)) + ' ' + u[i]; };
const gb = n => (n / 1073741824).toFixed(1) + ' GB';
const ago = t => { const s = (Date.now() - t) / 1000; if (s < 60) return 'ahora'; if (s < 3600) return `hace ${Math.floor(s / 60)} min`; if (s < 86400) return `hace ${Math.floor(s / 3600)} h`; if (s < 172800) return 'ayer'; return new Date(t).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }); };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function toast(msg, err = false, ms = 3800) {
  const t = h('div', { class: 'toast' + (err ? ' err' : '') }, msg); document.body.append(t); setTimeout(() => t.remove(), ms);
}
function confirmBox(title, text, okLabel = 'Aceptar', danger = false) {
  return new Promise(res => {
    const done = v => { m.remove(); res(v); };
    const m = h('div', { class: 'modal' }, h('div', { class: 'box' }, h('h3', {}, title), h('div', { class: 'muted' }, text),
      h('div', { class: 'acts' }, h('button', { class: 'btn', onclick: () => done(false) }, 'Cancelar'),
        h('button', { class: 'btn ' + (danger ? 'danger' : 'pri'), onclick: () => done(true) }, okLabel))));
    document.body.append(m);
  });
}
function infoBox(title, node) {
  const m = h('div', { class: 'modal', onclick: e => e.target === m && m.remove() }, h('div', { class: 'box', style: 'width:min(640px,94vw)' }, h('h3', {}, title), node, h('div', { class: 'acts' }, h('button', { class: 'btn', onclick: () => m.remove() }, 'Cerrar'))));
  document.body.append(m);
}

// markdown mínimo y seguro
function md(src, cites) {
  const blocks = []; let s = String(src ?? '');
  s = s.replace(/```(\w*)\n?([\s\S]*?)(```|$)/g, (_, lang, code) => { blocks.push({ lang, code: code.replace(/\n$/, '') }); return `\u0000B${blocks.length - 1}\u0000`; });
  s = esc(s);
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>').replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<i>$2</i>');
  if (cites) s = s.replace(/\[(\d{1,2})\]/g, (m, n) => `<span class="cite" data-n="${n}">[${n}]</span>`);
  const out = []; let list = null;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const line of s.split('\n')) {
    let m;
    if ((m = line.match(/^\s*[-*•]\s+(.*)/))) { if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${m[1]}</li>`); }
    else if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== 'ol') { close(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${m[1]}</li>`); }
    else if ((m = line.match(/^(#{1,4})\s+(.*)/))) { close(); out.push(`<h3>${m[2]}</h3>`); }
    else if (!line.trim()) { close(); }
    else { close(); out.push(`<p>${line}</p>`); }
  }
  close();
  return out.join('')
    .replace(/\u0000B(\d+)\u0000/g, (_, i) => { const b = blocks[+i]; return `<pre><span class="lang">${esc(b.lang || 'código')}</span><button class="btn sm cp" data-copy="${i}">Copiar</button><code>${esc(b.code)}</code></pre>`; })
    .replace(/<p>(<pre>[\s\S]*?<\/pre>)<\/p>/g, '$1');
}
// copiar bloques de código (delegado)
document.addEventListener('click', e => {
  const b = e.target.closest('[data-copy]'); if (!b) return;
  navigator.clipboard.writeText(b.parentElement.querySelector('code').textContent); const o = b.textContent; b.textContent = 'Copiado'; setTimeout(() => b.textContent = o, 1200);
});
