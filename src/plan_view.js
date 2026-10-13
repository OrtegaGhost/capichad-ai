// CapiChad - (c) 2026 Capibara Software (OrtegaGhost) - AGPL-3.0-or-later - https://github.com/OrtegaGhost/capichad-ai
// Aviso de autoria: conserva este encabezado y el archivo NOTICE en copias y derivados.
// ---------- Plan recomendado + descargas automáticas ----------
// Detecta el equipo, preselecciona lo que le alcanza, deja añadir el resto (con aviso) y luego descarga, reconoce,
// indexa y optimiza todo de forma automática. Se usa en el asistente de primer uso y en el menú «Descargas».
const fmtBytes = n => n >= 1024 ** 3 ? (n / 1024 ** 3).toFixed(n >= 10 * 1024 ** 3 ? 0 : 1) + ' GB' : n >= 1024 ** 2 ? Math.round(n / 1024 ** 2) + ' MB' : Math.round(n / 1024) + ' KB';
const fmtEta = s => !isFinite(s) || s <= 0 ? '—' : s < 90 ? Math.round(s) + ' s' : s < 5400 ? Math.round(s / 60) + ' min' : (s / 3600).toFixed(1) + ' h';
const LEVEL = { ok: ['Recomendado', 'ok'], warn: ['Puede ir justo', 'warn'], no: ['Probablemente no funcione', 'bad'] };
const STAGE_TXT = { start: 'Preparando…', resolve: 'Buscando las versiones más recientes…', models: 'Descargando modelos…', zims: 'Descargando la biblioteca…', engine: 'Instalando el generador de imágenes…',
  office: 'Instalando LibreOffice…', sites: 'Copiando libros libres…', verify: 'Comprobando que la biblioteca es legible…', index: 'Indexando libros…', optimize: 'Aplicando y optimizando…', done: 'Terminado' };

const PlanUI = S.planUI = S.planUI || { sel: new Set(), data: null, items: {}, stage: '', overall: null, summary: null, redraw: null, bound: false };
function planBind() {
  if (PlanUI.bound) return; PlanUI.bound = true;
  window.api.on('plan:event', ev => {
    if (ev.t === 'item') PlanUI.items[ev.id] = { ...(PlanUI.items[ev.id] || {}), ...ev };
    else if (ev.t === 'stage') PlanUI.stage = ev.stage;
    else if (ev.t === 'overall') PlanUI.overall = ev;
    else if (ev.t === 'done') { PlanUI.summary = ev.summary; PlanUI.stage = 'done'; refreshModels().then(() => { try { renderSide(); } catch {} }); }
    if (PlanUI.redraw) PlanUI.redraw();
  });
}

// Etiqueta de la tarjeta gráfica sin importar el fabricante (NVIDIA, AMD, Intel) y qué aceleración tendrá la IA
function gpuLabel(hw) {
  const g = hw.gpuPrimary || (hw.gpu ? { name: hw.gpu.name, vendor: 'NVIDIA', vramGB: hw.gpu.vramGB, integrated: false } : null);
  if (!g) return ['Sin tarjeta gráfica detectada', 'La IA usará el procesador'];
  const name = g.name.replace(/^NVIDIA GeForce /i, '').replace(/^AMD /i, '').replace(/^Intel\(R\) /i, '');
  const mem = g.integrated ? 'memoria compartida' : g.vramGB ? g.vramGB.toFixed(0) + ' GB' : '';
  const accel = g.vendor === 'NVIDIA' ? 'Aceleración CUDA' : g.vendor === 'AMD' ? 'Se acelera si la Radeon es compatible' : g.vendor === 'Intel' ? 'La IA usará el procesador' : 'La IA usará el procesador';
  return [`${g.vendor !== 'Otra' ? g.vendor + ' · ' : ''}${name}${mem ? ' · ' + mem : ''}`, accel];
}
// Tarjetas del equipo: memoria + procesador, tarjeta gráfica y disco/arquitectura
function hwCards(hw) {
  const c = (ic, t, v, sub) => h('div', {}, h('span', { class: 'ic', html: icon(ic) }), h('div', {}, h('small', {}, t), h('b', { style: 'font-size:1.05em' }, v), sub ? h('small', {}, sub) : null));
  const cpu = hw.cpu ? `${hw.cpu.vendor !== 'Otro' ? hw.cpu.vendor + ' ' : ''}${hw.cpu.name.replace(/\(R\)|\(TM\)|CPU|Processor/gi, '').replace(/^\s*(Intel|AMD)\s+/i, '').replace(/\s+/g, ' ').trim()}`.slice(0, 44) : `${hw.cores} núcleos`;
  const [g, accel] = gpuLabel(hw);
  const bits = hw.osBits ? `${hw.arch || ''} ${hw.osBits} bits`.trim() : '';
  return h('div', { class: 'card stat3', style: 'margin-bottom:14px' },
    c('cpu', 'Memoria y procesador', hw.ramTotalGB.toFixed(0) + ' GB RAM', cpu + (hw.cores ? ` · ${hw.cores} núcleos` : '')),
    c('gpu', 'Tarjeta gráfica', g, accel),
    c('disk', 'Disco y sistema', hw.diskFreeGB.toFixed(0) + ' GB libres', [hw.diskMedia || 'disco', bits, hw.remote ? 'Ollama remoto' : ''].filter(Boolean).join(' · ')));
}

async function renderPlan(box, o = {}) {
  planBind();
  const redraw = async () => { if (!box.isConnected) return; box.innerHTML = ''; await draw(); };
  PlanUI.redraw = () => { if (box.isConnected) redraw(); };
  const draw = async () => {
    const st = await invoke('plan:status');
    if (st.running || PlanUI.summary || (st.summary && !o.fresh)) return drawProgress(box, o, st);
    if (st.resumable) box.append(h('div', { class: 'banner warn' }, h('span', { class: 'ic', html: icon('refresh') }),
      h('div', { class: 't' }, h('b', {}, 'Hay una instalación sin terminar'), h('div', { class: 'muted' }, 'Puedes continuarla: lo ya descargado no se vuelve a bajar.')),
      h('button', { class: 'btn pri', onclick: async () => { PlanUI.summary = null; PlanUI.items = {}; await invoke('plan:start', st.resumable.selection); redraw(); } }, 'Continuar')));
    const wait = h('div', { class: 'muted', style: 'padding:30px;text-align:center' }, h('span', { class: 'spin' }), ' Analizando tu equipo…'); box.append(wait);
    let d; try { d = PlanUI.data = await invoke('plan:detect'); } catch (e) { wait.replaceWith(h('div', { class: 'err' }, 'No se pudo analizar el equipo: ' + e.message)); return; }
    if (!box.isConnected) return;
    if (!PlanUI._init) { PlanUI.sel = new Set(d.selected); PlanUI._init = true; }
    wait.remove();
    box.append(hwCards(d.hw));
    // estado de la integración: lo que CapiChad ya tiene funcionando
    try {
      const kb = await invoke('kb:status'); const ins = d.hw.installed || {}; const mods = (ins.models || []).filter(m => !/-cl:/i.test(m) && !/embed/i.test(m)).length;
      const chip = (ok, t) => h('span', { class: 'pill ' + (ok ? 'ok' : ''), style: 'margin:3px 6px 3px 0' }, (ok ? '✓ ' : '· ') + t);
      box.append(h('div', { class: 'card', style: 'margin-bottom:14px' }, h('b', {}, 'Tu CapiChad ahora⁠​‌​​​​‌‌​‌​‌​​​​​‌​​​​‌​​​‌​‌‌​‌​​‌‌​‌​‌​​‌‌​​​‌​​‌‌​​‌‌​‌‌​​​‌​​​‌‌​​​‌​​‌‌​​‌‌​‌‌​​​‌‌​​‌‌​​‌​⁠'), h('div', { style: 'margin-top:6px' },
        chip(mods > 0, `${mods} modelo(s) de IA`), chip(d.hw.libZims > 0, `${d.hw.libZims || 0} archivos de biblioteca`), chip(kb.libros > 0, `${kb.libros || 0} libros indexados`),
        chip(ins.engine, 'generador de imágenes'), chip(ins.office || d.hw.officeFound, 'conversión de documentos'), chip(true, 'internet opcional'))));
    } catch {}
    d.plan.notes.forEach(n => box.append(h('div', { class: 'banner warn', style: 'margin-bottom:10px' }, h('span', { class: 'ic', html: icon('alert') }), h('div', { class: 't' }, n))));

    const total = h('div', { class: 'card', style: 'margin-top:14px;display:flex;gap:16px;align-items:center;flex-wrap:wrap' });
    const go_ = h('button', { class: 'btn pri', style: 'padding:10px 24px' }, o.wizard ? 'Instalar lo seleccionado' : 'Descargar lo seleccionado');
    const speed = h('select', { title: 'Límite de velocidad de descarga', onchange: async e => { await invoke('plan:speed', +e.target.value); } },
      [[0, 'Velocidad: sin límite'], [5, 'Límite 5 MB/s'], [10, 'Límite 10 MB/s'], [20, 'Límite 20 MB/s']].map(([v, l]) => h('option', { value: v, selected: v === (st.maxMBs || 0) }, l)));
    const recalc = async () => {
      const ids = [...PlanUI.sel]; const t = await invoke('plan:totals', ids);
      total.innerHTML = '';
      total.append(h('div', { style: 'flex:1;min-width:260px' },
        h('b', {}, ids.length ? `${t.count} elemento(s) · ${t.downloadGB.toFixed(1)} GB por descargar` : 'No has elegido nada'),
        h('div', { class: 'muted' }, `Espacio libre después: ${t.freeAfterGB.toFixed(0)} GB` + (t.downloadGB ? ` · ≈ ${fmtEta(t.hoursAt10MBs * 3600)} a 10 MB/s` : '')),
        !t.fits && ids.length ? h('div', { style: 'color:var(--bad);margin-top:4px' }, `⚠ No cabe: se necesitan al menos ${d.reserveGB} GB libres de reserva. Quita elementos.`) : null,
        t.warns || t.nos.length ? h('div', { style: 'color:var(--warn);margin-top:4px' }, `⚠ Incluye ${t.warns + t.nos.length} elemento(s) que podrían no funcionar bien en tu equipo.`) : null), speed, go_);
      go_.disabled = !ids.length || !t.fits;
    };
    go_.onclick = async () => {
      const ids = [...PlanUI.sel];
      if (!ids.length) return toast('No has elegido nada.', true);
      PlanUI.summary = null; PlanUI.items = {}; PlanUI.stage = 'start'; PlanUI.overall = null;
      try { await invoke('plan:start', ids); } catch (e) { return toast(e.message, true); }
      redraw();
    };

    const groups = [['ok', 'Recomendado para tu equipo', 'Cabe con holgura y funcionará bien.'], ['warn', 'Disponible, pero puede ir justo', 'Puedes añadirlo: es posible que no funcione correctamente en tu equipo.'],
      ['no', 'No recomendado', 'Con lo que tiene tu equipo lo más probable es que no funcione (o no cabe en el disco).']];
    const KIND = { model: 'Modelo de IA', pack: 'Biblioteca', engine: 'Imágenes', office: 'Herramienta', sites: 'Libros' };
    for (const [lv, title, sub] of groups) {
      const rows = d.plan.items.filter(i => i.level === lv); if (!rows.length) continue;
      const sec = h('div', { class: 'card', style: 'margin-top:14px' }, h('div', { style: 'display:flex;align-items:baseline;gap:10px;flex-wrap:wrap' }, h('h3', { style: 'margin:0' }, title), h('span', { class: 'muted' }, sub)));
      rows.forEach(it => {
        const cb = h('input', { type: 'checkbox', checked: PlanUI.sel.has(it.id), disabled: it.installed,
          onchange: async e => {
            if (e.target.checked && it.level !== 'ok') {
              const why = (it.reason || []).join(' ') || 'Es posible que no funcione correctamente en tu equipo.';
              const yes = await confirmBox(it.level === 'no' ? 'No recomendado para tu equipo' : 'Puede ir justo en tu equipo', `${it.title}: ${why}\n\nEs posible que no funcione correctamente. ¿Quieres añadirlo de todas formas?`, 'Añadir de todas formas', it.level === 'no');
              if (!yes) { e.target.checked = false; return; }
            }
            e.target.checked ? PlanUI.sel.add(it.id) : PlanUI.sel.delete(it.id); recalc();
          } });
        sec.append(h('label', { style: 'display:flex;gap:12px;align-items:flex-start;padding:10px 0;border-top:1px solid var(--line);cursor:' + (it.installed ? 'default' : 'pointer') }, cb,
          h('div', { style: 'flex:1' },
            h('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap' }, h('b', {}, it.title), h('span', { class: 'pill', style: 'padding:0 8px;font-size:.78em' }, KIND[it.kind] || ''),
              it.installed ? h('span', { class: 'pill ok', style: 'padding:0 8px;font-size:.78em' }, 'Ya instalado ✓') : null),
            h('div', { class: 'muted' }, it.desc + (it.files ? ` (${it.files} archivos)` : '')),
            ...(it.reason || []).map(r => h('div', { style: 'color:' + (it.level === 'no' ? 'var(--bad)' : 'var(--warn)') + ';font-size:.9em;margin-top:2px' }, '⚠ ' + r))),
          h('div', { style: 'text-align:right;white-space:nowrap' }, h('b', {}, fmtBytes(it.bytes)))));
      });
      box.append(sec);
    }
    box.append(total); await recalc();
    box.append(h('div', { class: 'muted', style: 'margin-top:10px;font-size:.88em' },
      `Se guarda en ${d.hw.kbHome.replace(/\//g, '\\')} (variable CAPICHAD_HOME para cambiarlo). Las descargas se reanudan solas si se cortan; los archivos se verifican con SHA-256.`));
  };
  await draw();
}

function drawProgress(box, o, st) {
  const d = PlanUI.data; const sum = PlanUI.summary || (st.summary && !st.running ? st.summary : null);
  const sel = st.selection || [...PlanUI.sel]; const rows = [];
  const byGroup = {}; st.items.forEach(i => { (byGroup[i.group || i.id] = byGroup[i.group || i.id] || []).push(i); });
  (d ? d.plan.items : []).filter(i => sel.includes(i.id) && !i.installed).forEach(it => {
    let state = 'queued', done = 0, bytes = it.bytes, bps = 0, err = '', note = '';
    if (it.kind === 'pack') {
      const g = byGroup[it.id] || []; if (g.length) { done = g.reduce((s, x) => s + Math.min(x.done || 0, x.bytes || x.done || 0), 0); bytes = g.reduce((s, x) => s + (x.bytes || 0), 0) || bytes; bps = g.reduce((s, x) => s + (x.state === 'downloading' ? x.bps : 0), 0);
        const dn = g.filter(x => x.state === 'done').length; note = `${dn} de ${g.length} archivos`;
        state = g.every(x => x.state === 'done') ? 'done' : g.some(x => ['error', 'nospace'].includes(x.state)) ? 'error' : g.some(x => x.state === 'downloading' || x.state === 'verifying') ? 'downloading' : g.every(x => x.state === 'paused') ? 'paused' : 'queued';
        err = (g.find(x => x.error) || {}).error || ''; }
    } else { const e = PlanUI.items[it.id]; if (e) { state = e.state || 'queued'; done = e.done || 0; bytes = e.bytes || bytes; bps = e.bps || 0; err = e.error || ''; note = e.text || ''; } }
    rows.push({ it, state, done, bytes, bps, err, note });
  });
  const tot = rows.reduce((s, r) => s + r.bytes, 0), dn = rows.reduce((s, r) => s + (r.state === 'done' ? r.bytes : Math.min(r.done, r.bytes)), 0);
  const bps = PlanUI.overall ? PlanUI.overall.bps : rows.reduce((s, r) => s + (r.state === 'downloading' ? r.bps : 0), 0);
  const pct = tot ? Math.min(100, Math.round(100 * dn / tot)) : 0;

  if (sum) {
    box.append(h('div', { class: 'card', style: 'text-align:center;padding:26px' },
      h('div', { style: 'font-size:3em;color:' + (sum.ok ? 'var(--ok)' : 'var(--warn)'), html: icon(sum.ok ? 'check' : 'alert') }),
      h('h2', {}, sum.aborted ? 'Instalación detenida' : sum.ok ? '¡Todo listo!' : 'Terminó con avisos'),
      h('div', { class: 'muted' }, sum.aborted ? 'Puedes continuarla cuando quieras: lo ya descargado se conserva.' :
        `${(sum.models || []).length} modelo(s) · ${sum.zims || 0} archivos de biblioteca · ${sum.engine ? 'generador de imágenes · ' : ''}${sum.office ? 'LibreOffice · ' : ''}${sum.sites ? 'libros libres · ' : ''}${Math.round((sum.seconds || 0) / 60)} min`),
      sum.error ? h('div', { class: 'err', style: 'margin-top:10px' }, sum.error) : null,
      ...((sum.notes || []).slice(0, 6).map(n => h('div', { style: 'color:var(--warn);margin-top:4px;font-size:.92em' }, '⚠ ' + n))),
      (sum.missing && sum.missing.length) ? h('div', { class: 'muted', style: 'margin-top:6px;font-size:.9em' }, `${sum.missing.length} archivo(s) del catálogo ya no existen en el servidor y se omitieron.`) : null,
      h('div', { class: 'toolrow', style: 'justify-content:center;margin-top:16px' },
        h('button', { class: 'btn pri', style: 'padding:10px 26px', onclick: async () => { S.cfg = await invoke('cfg:set', { setupDone: true }); PlanUI.summary = null; PlanUI._init = false; go('home'); } }, 'Empezar a usar CapiChad'),
        h('button', { class: 'btn', onclick: () => { PlanUI.summary = null; PlanUI._init = false; PlanUI.items = {}; invoke('plan:status').then(() => renderPlan(box.parentElement ? box : box, { ...o, fresh: true })); box.innerHTML = ''; renderPlan(box, { ...o, fresh: true }); } }, 'Añadir más'))));
    return;
  }
  box.append(h('div', { class: 'card' },
    h('div', { style: 'display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px' },
      h('b', {}, STAGE_TXT[PlanUI.stage || st.stage] || 'Trabajando…'),
      h('span', { class: 'muted' }, `${fmtBytes(dn)} de ${fmtBytes(tot)} · ${bps ? (bps / 1024 ** 2).toFixed(1) + ' MB/s · faltan ' + fmtEta((tot - dn) / bps) : 'esperando…'}`)),
    h('div', { class: 'bar', style: 'margin:10px 0' }, h('i', { style: `width:${pct}%` })),
    h('div', { class: 'toolrow', style: 'margin-top:4px' },
      st.paused ? h('button', { class: 'btn pri', onclick: async () => { await invoke('plan:resume'); PlanUI.redraw && PlanUI.redraw(); } }, h('span', { html: icon('refresh') }), 'Reanudar')
        : h('button', { class: 'btn', onclick: async () => { await invoke('plan:pause'); PlanUI.redraw && PlanUI.redraw(); } }, 'Pausar'),
      h('button', { class: 'btn danger', onclick: async () => { if (await confirmBox('Detener la instalación', 'Se detendrá. Lo ya descargado se conserva y podrás continuar después.', 'Detener', true)) { await invoke('plan:stop'); } } }, h('span', { html: icon('stop') }), 'Detener'),
      o.wizard ? h('button', { class: 'btn', title: 'La descarga sigue en segundo plano; puedes verla en «Descargas»', onclick: async () => { S.cfg = await invoke('cfg:set', { setupDone: true }); go('home'); } }, 'Seguir en segundo plano') : null,
      h('span', { class: 'muted' }, 'Puedes cerrar esta pantalla: la instalación continúa.'))));
  const list = h('div', { class: 'card', style: 'margin-top:12px' });
  const STATE = { queued: ['En cola', 'var(--mut)'], downloading: ['Descargando', 'var(--acc)'], verifying: ['Verificando', 'var(--cyan)'], paused: ['En pausa', 'var(--warn)'], done: ['Listo ✓', 'var(--ok)'], error: ['Error', 'var(--bad)'], nospace: ['Sin espacio', 'var(--bad)'], cancelled: ['Cancelado', 'var(--mut)'] };
  rows.forEach(r => {
    const p = r.bytes ? Math.min(100, Math.round(100 * (r.state === 'done' ? r.bytes : r.done) / r.bytes)) : 0; const [lbl, col] = STATE[r.state] || STATE.queued;
    list.append(h('div', { style: 'padding:10px 0;border-top:1px solid var(--line)' },
      h('div', { style: 'display:flex;gap:10px;align-items:baseline;flex-wrap:wrap' }, h('b', { style: 'flex:1' }, r.it.title), h('span', { style: 'color:' + col }, lbl), h('span', { class: 'muted' }, fmtBytes(r.bytes))),
      h('div', { class: 'bar', style: 'margin:6px 0 2px' }, h('i', { style: `width:${p}%` })),
      h('div', { class: 'muted', style: 'font-size:.88em' }, [r.note, r.bps ? (r.bps / 1024 ** 2).toFixed(1) + ' MB/s' : ''].filter(Boolean).join(' · ')),
      r.err ? h('div', { style: 'color:var(--bad);font-size:.9em' }, r.err + ' ', h('a', { href: '#', onclick: e => { e.preventDefault(); const ids = (byGroup[r.it.id] || []).filter(x => ['error', 'nospace', 'cancelled'].includes(x.state)).map(x => x.id); ids.forEach(id => invoke('plan:retry', id)); } }, 'Reintentar')) : null));
  });
  box.append(list);
}

// ---------- menú «Descargas» ----------
VIEWS.downloads = async main => {
  const v = h('div', { class: 'view' }); const box = h('div', {});
  v.append(head('Descargas', 'Modelos, enciclopedias y funciones adicionales. Elige y CapiChad lo descarga, lo reconoce, lo indexa y lo optimiza solo.'), box);
  main.append(v); S.cleanup = () => { PlanUI.redraw = null; };
  await renderPlan(box, { wizard: false });
};
