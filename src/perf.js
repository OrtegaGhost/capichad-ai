// CapiChad - (c) 2026 Capibara Software (OrtegaGhost) - AGPL-3.0-or-later - https://github.com/OrtegaGhost/capichad-ai
// Aviso de autoria: conserva este encabezado y el archivo NOTICE en copias y derivados.
// CapiChad - Rendimiento y almacenamiento
const fmtGB = n => (n / 1073741824).toFixed(n >= 1.07e11 ? 0 : 1) + ' GB';
const mhzTxt = m => m >= 1000 ? (m / 1000).toFixed(2) + ' GHz' : Math.round(m) + ' MHz';
const kv = (k, v, cls = '') => h('div', { class: 'kv' }, h('span', { class: 'k' }, k), h('span', { class: 'v ' + cls }, v == null || v === '' ? '—' : v));
const section = (ic, title, sub, ...body) => h('div', { class: 'card psec' }, h('div', { class: 'ph' }, h('span', { class: 'ic', html: icon(ic) }), h('div', {}, h('b', {}, title), sub ? h('small', {}, sub) : null)), ...body);
const miniBar = (pct, cls = '') => h('div', { class: 'bar ' + cls }, h('i', { style: `width:${Math.max(0, Math.min(100, pct))}%` }));
const tone = p => p > 85 ? 'bad' : p > 70 ? 'warn' : '';

// ---------- mover datos / modelos a otra carpeta o unidad ----------
async function runMove(title, text, job) {
  const bar = h('div', { class: 'bar' }, h('i', { style: 'width:4%' })), msg = h('div', { class: 'muted', style: 'margin-top:8px' }, 'Preparando…');
  const m = h('div', { class: 'modal' }, h('div', { class: 'box' }, h('h3', {}, title), h('div', { class: 'muted' }, text), bar, msg));
  const off = window.api.on('move:progress', d => { const p = d.total ? Math.min(99, Math.round(100 * d.done / d.total)) : 0; $('i', bar).style.width = Math.max(4, p) + '%'; msg.textContent = `Copiando… ${gb(d.done)} de ${gb(d.total)} (${p}%)`; });
  document.body.append(m);
  try { const r = await job(); off(); m.remove(); return r; } catch (e) { off(); m.remove(); toast(e.message, true, 8000); return null; }
}
async function afterMove(olds) {
  const list = olds.filter(Boolean); if (!list.length) return;
  const ok = await confirmBox('Listo, todo copiado', `CapiChad ya usa la nueva ubicación. Las carpetas anteriores siguen ocupando espacio:\n${list.join('\n')}\n\n¿Quieres borrarlas ahora para liberar espacio?`, 'Borrar anteriores', true);
  if (ok) { for (const d of list) { try { await invoke('dir:remove', d); } catch (e) { toast(e.message, true); } } toast('Espacio liberado'); }
}
async function moveModelsTo(dest) {
  const r = await runMove('Moviendo modelos', `Copiando los modelos a ${dest}. No cierres la aplicación.`, () => invoke('models:moveDir', dest));
  if (r) { await refreshModels(); toast('Carpeta de modelos actualizada'); await afterMove([r.from]); } return r;
}
async function moveDataTo(dest) {
  const r = await runMove('Moviendo datos', `Copiando chats, documentos y ajustes a ${dest}.`, () => invoke('cfg:moveDataAsync', dest));
  if (r) { S.cfg = await invoke('cfg:get'); await Promise.all([refreshChats(), refreshDocs(), refreshAssistants()]); renderSide(); toast('Carpeta de datos actualizada'); await afterMove([r.from]); } return r;
}
async function useDrive(letter, label) {
  const root = `${letter}:\\CapiChad`;
  if (!(await confirmBox('Usar esta unidad para CapiChad', `Se copiarán los modelos y tus datos a:\n${root}\\modelos\n${root}\\datos\n\nLos originales no se borran hasta que tú lo decidas.`, 'Usar esta unidad'))) return;
  const a = await moveModelsTo(root + '\\modelos'); if (!a) return; await moveDataTo(root + '\\datos');
  if (VIEWS._perfRefresh) VIEWS._perfRefresh();
}

VIEWS.performance = async main => {
  const v = h('div', { class: 'view' }); const hist = []; let last = Date.now(), hw = null, st = null, stAt = 0;
  const stat = h('span', { class: 'dim' }, ''); const els = {};
  const metric = (k, ic, label) => { const b = h('b', {}, '—'), sub = h('div', { class: 'muted', style: 'font-size:.85em' }, ' '), bar = h('div', { class: 'bar' }, h('i')); els[k] = { b, sub, bar }; return h('div', { class: 'card metric' }, h('small', {}, h('span', { html: icon(ic), style: 'color:var(--acc);font-size:1.4em' }), label), b, sub, bar); };
  const canvas = h('canvas', { class: 'chart', width: 900, height: 190 });
  const sess = h('div', {}); const banner = h('div', {});
  const ramBox = h('div', {}), cpuBox = h('div', {}), gpuBox = h('div', {}), stoBox = h('div', {}, h('div', { class: 'muted' }, 'Leyendo unidades…'));
  v.append(head('Rendimiento', 'Revisa los recursos que utiliza tu IA.', h('button', { class: 'btn', onclick: () => infoBox('Registro', h('pre', { class: 'sel', style: 'max-height:50vh;overflow:auto;font-size:.82em;white-space:pre-wrap' }, S.log.slice(-80).join('\n') || 'Sin eventos todavía.')) }, h('span', { html: icon('list') }), 'Ver registro'),
    h('span', { class: 'pill ' + (S.engine ? 'ok' : 'warn'), id: 'engpill' }, h('i', { class: 'dot ' + (S.engine ? 'ok' : 'bad') }), S.engine ? 'Motor activo' : 'Motor detenido')),
    h('div', { class: 'metrics' }, metric('ram', 'cpu', 'Memoria RAM'), metric('cpu', 'cpu', 'Procesador'), metric('gpu', 'gpu', 'GPU'), metric('mod', 'box', 'Modelo activo')),
    h('div', { class: 'two', style: 'grid-template-columns:1.6fr 1fr' }, h('div', { class: 'card' }, h('h3', { style: 'margin:0' }, 'Uso de memoria'), h('div', { class: 'muted', style: 'margin-bottom:6px' }, 'Memoria RAM utilizada por el equipo.'), canvas),
      h('div', { class: 'card' }, h('h3', { style: 'margin:0 0 12px' }, 'Sesión actual'), sess)), banner,
    section('cpu', 'Memoria RAM', 'Módulos instalados y velocidad', ramBox), section('cpu', 'Procesador', 'Modelo, frecuencias y uso por núcleo', cpuBox),
    section('gpu', 'Tarjeta gráfica', 'Datos en vivo de tu GPU', gpuBox), section('disk', 'Almacenamiento', 'Unidades, espacio y lo que ocupa CapiChad', stoBox),
    h('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-top:14px' }, stat, h('button', { class: 'iconb', title: 'Actualizar', onclick: () => { tick(); loadStorage(true); }, html: icon('refresh') })));
  main.append(v);

  // --- gráfico ---
  const paint = () => {
    const c = canvas, g = c.getContext('2d'), W = c.width, H = c.height, pad = 38; g.clearRect(0, 0, W, H); const css = getComputedStyle(document.documentElement);
    const max = Math.max(4, Math.ceil((S.sys?.ramTotal || 16 * 2 ** 30) / 2 ** 30 / 4) * 4); g.font = '12px Segoe UI'; g.fillStyle = css.getPropertyValue('--dim'); g.strokeStyle = css.getPropertyValue('--line');
    for (let i = 0; i <= 4; i++) { const y = 8 + (H - 30) * i / 4; g.beginPath(); g.moveTo(pad, y); g.lineTo(W, y); g.stroke(); g.fillText(Math.round(max * (1 - i / 4)) + ' GB', 0, y + 4); }
    if (hist.length < 2) return; const step = (W - pad) / 149; g.beginPath(); hist.forEach((p, i) => { const x = pad + (150 - hist.length + i) * step, y = 8 + (H - 30) * (1 - p / max); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.strokeStyle = '#2f7bff'; g.lineWidth = 2.5; g.stroke(); g.lineTo(W, H - 22); g.lineTo(pad + (150 - hist.length) * step, H - 22); g.fillStyle = 'rgba(47,123,255,.18)'; g.fill();
    g.fillStyle = css.getPropertyValue('--dim'); g.fillText('Hace 5 min', pad, H - 4); g.fillText('Ahora', W - 40, H - 4);
  };

  // --- RAM ---
  const drawRam = p => {
    const free = p.ramTotal - p.ramUsed, pct = Math.round(100 * p.ramUsed / p.ramTotal); ramBox.innerHTML = '';
    ramBox.append(h('div', { class: 'stat4' }, h('div', {}, h('small', {}, 'Total'), h('b', {}, gb(p.ramTotal))), h('div', {}, h('small', {}, 'En uso'), h('b', {}, gb(p.ramUsed))), h('div', {}, h('small', {}, 'Disponible'), h('b', {}, gb(free))), h('div', {}, h('small', {}, 'Ocupación'), h('b', { class: tone(pct) }, pct + '%'))), miniBar(pct, tone(pct)));
    if (!hw) { ramBox.append(h('div', { class: 'muted', style: 'margin-top:12px' }, 'Leyendo módulos de memoria…')); return; }
    const mods = hw.ram.modules; if (!mods.length) { ramBox.append(h('div', { class: 'muted', style: 'margin-top:12px' }, 'No se pudo leer el detalle de los módulos.')); return; }
    const same = mods.every(m => m.cap === mods[0].cap), conf = Math.max(...mods.map(m => m.conf)), nom = Math.max(...mods.map(m => m.speed)), type = mods[0].type;
    const mtp = n => n ? `${n} MT/s` : '—';
    ramBox.append(h('div', { class: 'chips2' },
      h('span', { class: 'tag use' }, `${mods.length} módulo${mods.length === 1 ? '' : 's'}`), h('span', { class: 'tag ok' }, `${mods.length} de ${hw.ram.slots} ranuras ocupadas`), h('span', { class: 'tag use' }, type), h('span', { class: 'tag use' }, mods[0].ff),
      mods.length >= 2 && same ? h('span', { class: 'tag ok' }, 'Doble canal') : mods.length >= 2 ? h('span', { class: 'tag warn' }, 'Tamaños distintos: doble canal parcial') : h('span', { class: 'tag warn' }, 'Un solo módulo (canal simple)'),
      conf < nom ? h('span', { class: 'tag warn' }, `Trabaja a ${conf} MT/s, menos que los ${nom} nominales`) : null));
    const tbl = h('div', { class: 'tbl' }, h('div', { class: 'tr th' }, ...['Ranura', 'Capacidad', 'Tipo', 'Velocidad nominal', 'Velocidad de trabajo', 'Fabricante / modelo', 'Voltaje'].map(t => h('span', {}, t))));
    mods.forEach(m => tbl.append(h('div', { class: 'tr' }, h('span', {}, m.slot || '—'), h('span', {}, gb(m.cap)), h('span', {}, `${m.type} ${m.ff}`), h('span', {}, mtp(m.speed)), h('span', { class: m.conf < m.speed ? 'warnc' : '' }, mtp(m.conf)), h('span', { class: 'sel' }, [m.mfr, m.pn].filter(Boolean).join(' · ') || '—'), h('span', {}, m.volt ? m.volt.toFixed(2) + ' V' : '—'))));
    ramBox.append(tbl, h('div', { class: 'dim', style: 'font-size:.82em;margin-top:8px' }, `MT/s = millones de transferencias por segundo (${type}-${Math.max(conf, nom) || ''} equivale a unos ${Math.round(Math.max(conf, nom) / 2)} MHz reales). ${conf < nom ? 'Es normal que trabajen por debajo de su velocidad nominal: el procesador y la placa limitan la velocidad, y con módulos distintos se usa la del más lento. ' : ''}Capacidad máxima soportada por la placa: ${hw.ram.maxCap ? gb(hw.ram.maxCap) : 'no informada'}.`));
  };

  // --- CPU ---
  const drawCpu = p => {
    cpuBox.innerHTML = ''; const c = hw?.cpu; const cores = p.cores || [];
    cpuBox.append(h('div', { class: 'big2' }, h('b', {}, c?.name || S.sys?.cpu || 'Procesador'), h('span', { class: 'muted' }, [c?.mfr, c?.desc].filter(Boolean).join(' · '))));
    const cur = p.cpuMHz;
    cpuBox.append(h('div', { class: 'kvs' }, kv('Núcleos físicos', c?.cores), kv('Hilos (procesadores lógicos)', c?.threads), kv('Frecuencia base', c?.maxMHz ? mhzTxt(c.maxMHz) : null),
      kv('Frecuencia actual', cur ? mhzTxt(cur) : 'Midiendo…', cur && c?.maxMHz && cur > c.maxMHz * 1.02 ? 'okc' : ''), kv('Rendimiento vs. base', p.cpuPerf != null ? Math.round(p.cpuPerf) + '%' : null),
      kv('Uso total', p.cpu + '%', tone(p.cpu)), kv('Caché L2', c?.l2 ? (c.l2 / 1024).toFixed(c.l2 >= 1024 ? 1 : 2) + ' MB' : null), kv('Caché L3', c?.l3 ? (c.l3 / 1024).toFixed(0) + ' MB' : null),
      kv('Zócalo', c?.socket), kv('Arquitectura', c?.arch), kv('Virtualización', c?.virt == null ? null : c.virt ? 'Activada' : 'Desactivada'), kv('Equipo', hw?.pc ? `${hw.pc.Manufacturer || ''} ${hw.pc.Model || ''}`.trim() : null)));
    if (cores.length) { const g = h('div', { class: 'cores' }); cores.forEach((x, i) => g.append(h('div', { class: 'core' }, h('small', {}, `Hilo ${i + 1}`), miniBar(x, tone(x)), h('b', {}, x + '%')))); cpuBox.append(h('div', { class: 'sub' }, 'Uso por hilo'), g); }
  };

  // --- GPU ---
  const drawGpu = p => {
    gpuBox.innerHTML = ''; const g = p.gpu; const list = hw?.gpus || [];
    if (g) {
      const vp = g.vramTotal ? Math.round(100 * g.vramUsed / g.vramTotal) : 0;
      gpuBox.append(h('div', { class: 'big2' }, h('b', {}, g.name), h('span', { class: 'tag ok' }, 'Dedicada'), h('span', { class: 'muted' }, `Controlador ${g.driver || '—'}`)));
      gpuBox.append(h('div', { class: 'kvs' }, kv('Memoria de video (VRAM)', `${g.vramUsed.toFixed(2)} / ${g.vramTotal.toFixed(0)} GB (${vp}%)`, tone(vp)), kv('Uso del procesador gráfico', Math.round(g.util) + '%'), kv('Uso del controlador de memoria', g.memUtil != null ? Math.round(g.memUtil) + '%' : null),
        kv('Temperatura', g.temp != null ? g.temp + ' °C' : null, g.temp > 85 ? 'bad' : g.temp > 75 ? 'warn' : ''), kv('Consumo', g.power != null ? `${g.power.toFixed(1)} W${g.powerLimit ? ' / ' + g.powerLimit.toFixed(0) + ' W máx.' : ''}` : 'No informado'),
        kv('Reloj del núcleo', g.clock != null ? `${g.clock} MHz${g.clockMax ? ' / ' + g.clockMax + ' máx.' : ''}` : null), kv('Reloj de memoria', g.memClock != null ? `${g.memClock} MHz${g.memClockMax ? ' / ' + g.memClockMax + ' máx.' : ''}` : null),
        kv('Bus PCIe', g.pcieGen ? `Gen ${g.pcieGen} x${g.pcieWidth}` : null), kv('Ventilador', g.fan != null ? g.fan + '%' : 'No informado'), kv('Estado de energía', g.pstate)));
      gpuBox.append(miniBar(vp, 'cy'), h('div', { class: 'dim', style: 'font-size:.82em;margin:6px 0 0' }, 'La VRAM limita qué tan grande puede ser el modelo que corre solo en la GPU; lo que no cabe se procesa en la RAM y el procesador.'));
    } else gpuBox.append(h('div', { class: 'muted' }, 'No se detectó una GPU NVIDIA con datos en vivo. Se usará el procesador.'));
    list.filter(x => !g || !x.name.includes(g.name.replace('NVIDIA ', ''))).forEach(x => gpuBox.append(h('div', { class: 'sub' }, 'Otra tarjeta gráfica'), h('div', { class: 'kvs' }, kv('Nombre', x.name), kv('Controlador', x.driver), kv('Resolución actual', x.res !== 'x' ? `${x.res} a ${x.hz} Hz` : null), kv('Tipo', /intel|amd radeon\(tm\) graphics/i.test(x.name) ? 'Integrada (comparte la RAM)' : null))));
  };

  // --- almacenamiento ---
  const drawSto = s => {
    stoBox.innerHTML = ''; if (!s || !s.disks.length) { stoBox.append(h('div', { class: 'muted' }, 'No se pudo leer el almacenamiento.')); return; }
    const phys = s.disks.filter(d => d.id !== '_other'); const pct = s.volTotal ? Math.round(100 * s.used / s.volTotal) : 0;
    stoBox.append(h('div', { class: 'stat4' }, h('div', {}, h('small', {}, 'Capacidad total'), h('b', {}, fmtGB(s.totalSize))), h('div', {}, h('small', {}, `Discos físicos`), h('b', {}, phys.length)),
      h('div', {}, h('small', {}, 'Ocupado'), h('b', { class: tone(pct) }, fmtGB(s.used))), h('div', {}, h('small', {}, 'Libre'), h('b', {}, fmtGB(s.free)))), miniBar(pct, tone(pct)));
    const grid = h('div', { class: 'disks' });
    s.disks.forEach(d => {
      const card = h('div', { class: 'disk' }, h('div', { class: 'dh' }, h('span', { class: 'ic', html: icon('disk') }), h('div', { style: 'flex:1;min-width:0' }, h('b', { class: 'sel' }, d.name || 'Disco'), h('small', {}, [d.media && d.media !== 'Unspecified' ? d.media : '', d.bus, d.size ? fmtGB(d.size) : ''].filter(Boolean).join(' · '))), d.health ? h('span', { class: 'tag ' + (/healthy/i.test(d.health) ? 'ok' : 'warn') }, /healthy/i.test(d.health) ? 'Saludable' : d.health) : null));
      d.volumes.forEach(vo => { const up = vo.size ? Math.round(100 * vo.used / vo.size) : 0; const sys = vo.letter.toUpperCase() === s.sysLetter, usable = !sys && vo.free > 20 * 2 ** 30 && /fixed/i.test(vo.type);
        card.append(h('div', { class: 'vol' }, h('div', { class: 'vt' }, h('b', {}, `${vo.letter}:`), h('span', { class: 'muted' }, vo.label || (sys ? 'Sistema' : 'Sin nombre')), h('span', { class: 'dim' }, vo.fs), sys ? h('span', { class: 'tag use' }, 'Sistema') : null, h('span', { class: 'sp' }), usable ? h('button', { class: 'btn sm pri', onclick: () => useDrive(vo.letter) }, 'Usar para CapiChad') : null),
          miniBar(up, tone(up)), h('div', { class: 'vd' }, h('span', {}, `${gb(vo.used)} ocupados`), h('span', {}, `${gb(vo.free)} libres de ${fmtGB(vo.size)}`)))); });
      grid.append(card);
    });
    stoBox.append(grid);
    const m = s.mine, tot = s.mineTotal || 1; const seg = (k, c) => h('i', { style: `width:${Math.max(1, 100 * m[k].size / tot)}%;background:${c}`, title: gb(m[k].size) });
    const row = (c, name, o, extra) => h('div', { class: 'mrow' }, h('i', { style: `background:${c}` }), h('div', { style: 'flex:1;min-width:0' }, h('b', {}, name), h('small', { class: 'sel' }, o.path)), h('b', {}, bytes(o.size)), extra);
    stoBox.append(h('div', { class: 'sub' }, 'Lo que ocupa CapiChad'), h('div', { class: 'mine' }, h('div', { class: 'big2' }, h('b', {}, bytes(s.mineTotal)), h('span', { class: 'muted' }, `en total, ${s.volTotal ? (100 * s.mineTotal / s.volTotal).toFixed(1) : 0}% del almacenamiento`)),
      h('div', { class: 'stack' }, seg('app', 'var(--acc)'), seg('models', 'var(--violet)'), seg('data', 'var(--ok)')),
      row('var(--acc)', 'Programa', m.app), row('var(--violet)', 'Modelos de IA', m.models, h('button', { class: 'btn sm', onclick: async () => { const d = await invoke('cfg:pickFolder'); if (d && await confirmBox('Mover modelos', `Se copiarán los modelos a:\n${d}`, 'Mover')) { await moveModelsTo(d); loadStorage(true); } } }, 'Mover…')),
      row('var(--ok)', 'Datos (chats y documentos)', m.data, h('button', { class: 'btn sm', onclick: async () => { const d = await invoke('cfg:pickFolder'); if (d && await confirmBox('Mover datos', `Se copiarán tus datos a:\n${d}`, 'Mover')) { await moveDataTo(d); loadStorage(true); } } }, 'Mover…'))));
    const fresh = phys.length > 1 || s.disks.some(d => d.volumes.some(vo => vo.letter.toUpperCase() !== s.sysLetter));
    if (!fresh) stoBox.append(h('div', { class: 'banner', style: 'margin-top:14px' }, h('span', { class: 'ic', html: icon('info') }), h('div', { class: 't' }, 'Cuando conectes una unidad nueva aparecerá aquí con el botón “Usar para CapiChad”, que mueve modelos y datos a ella.')));
  };
  async function loadStorage(force) { if (!force && Date.now() - stAt < 20000) return; stAt = Date.now(); try { st = await invoke('sys:storage'); drawSto(st); } catch (e) { stoBox.innerHTML = 'No se pudo leer el almacenamiento: ' + e.message; } }
  VIEWS._perfRefresh = () => loadStorage(true);

  async function tick() {
    const [p, es] = await Promise.all([invoke('sys:perf'), invoke('ollama:status')]); S.engine = es.running; S.sys = S.sys || await invoke('sys:info'); last = Date.now(); S.lastPerf = p;
    const rp = Math.round(100 * p.ramUsed / p.ramTotal); hist.push(p.ramUsed / 2 ** 30); if (hist.length > 150) hist.shift();
    els.ram.b.innerHTML = `${(p.ramUsed / 2 ** 30).toFixed(1)} / ${(p.ramTotal / 2 ** 30).toFixed(0)} GB <span style="color:${rp > 85 ? 'var(--bad)' : rp > 70 ? 'var(--warn)' : 'var(--ok)'};font-size:.7em">${rp}%</span>`; $('i', els.ram.bar).style.width = rp + '%'; els.ram.bar.className = 'bar ' + tone(rp);
    const m0 = hw?.ram.modules[0]; els.ram.sub.textContent = m0 ? `${hw.ram.modules.length}× ${m0.type} a ${Math.max(...hw.ram.modules.map(m => m.conf))} MT/s` : ' ';
    els.cpu.b.textContent = p.cpu + '%'; $('i', els.cpu.bar).style.width = p.cpu + '%'; els.cpu.sub.textContent = p.cpuMHz ? `${mhzTxt(p.cpuMHz)} · ${hw?.cpu.threads || ''} hilos` : (hw ? `${hw.cpu.cores} núcleos · ${hw.cpu.threads} hilos` : ' ');
    if (p.gpu) { els.gpu.b.textContent = Math.round(p.gpu.util) + '%'; els.gpu.sub.textContent = `VRAM ${p.gpu.vramUsed.toFixed(1)} / ${p.gpu.vramTotal.toFixed(0)} GB${p.gpu.temp != null ? ' · ' + p.gpu.temp + ' °C' : ''}`; $('i', els.gpu.bar).style.width = p.gpu.util + '%'; els.gpu.bar.className = 'bar cy'; } else { els.gpu.b.textContent = 'No detectada'; els.gpu.sub.textContent = 'Se usa el procesador'; }
    const L = p.loaded[0]; els.mod.b.textContent = L ? shortName(L.name) : 'Ninguno'; els.mod.b.style.fontSize = '1.1em'; els.mod.sub.textContent = L ? `Local · ${gb(L.size)}${L.vram ? ` (${Math.round(100 * L.vram / L.size)}% en GPU)` : ''}` : 'Se carga al conversar'; $('i', els.mod.bar).style.width = L ? '100%' : '0%';
    const pill = $('#engpill'); if (pill) { pill.className = 'pill ' + (S.engine ? 'ok' : 'warn'); pill.innerHTML = `<i class="dot ${S.engine ? 'ok' : 'bad'}"></i>${S.engine ? 'Motor activo' : 'Motor detenido'}`; }
    const tps = S.log.filter(l => /tok\/s/.test(l)).slice(-1)[0]; const idx = S.docs.filter(d => d.status === 'indexando').length;
    sess.innerHTML = `<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--line)"><span class="muted">Velocidad última respuesta</span><b>${tps ? tps.match(/a ([\d.]+) tok/)?.[1] + ' tok/s' : '—'}</b></div>
      <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--line)"><span class="muted">Conversaciones abiertas</span><b>${S.session.size}</b></div>
      <div style="display:flex;justify-content:space-between;padding:10px 0"><span class="muted">Archivos en preparación</span><b>${idx}</b></div>`;
    banner.innerHTML = ''; const lightest = [...chatModels()].sort((a, b) => a.size - b.size)[0];
    if (!es.running) banner.append(h('div', { class: 'banner bad' }, h('span', { class: 'ic', html: icon('alert') }), h('div', { class: 't' }, h('b', {}, 'El motor de IA está detenido.'), h('div', { class: 'muted' }, S.installed ? 'Puedes iniciarlo ahora.' : 'Ollama no está instalado.')), S.installed ? h('button', { class: 'btn pri', onclick: async () => { await invoke('ollama:start'); tick(); } }, 'Iniciar motor') : h('button', { class: 'btn pri', onclick: () => invoke('ollama:openDownload') }, 'Descargar Ollama')));
    else if (S.lastError) banner.append(h('div', { class: 'banner warn' }, h('span', { class: 'ic', style: 'color:var(--warn)', html: icon('alert') }), h('div', { class: 't' }, h('b', {}, `No se pudo usar ${shortName(S.lastError.model)}.`), h('div', { class: 'muted' }, S.lastError.msg)),
      lightest && lightest.name !== S.lastError.model ? h('button', { class: 'btn pri', onclick: () => { S.model = lightest.name; S.lastError = null; toast(`Usando ${shortName(lightest.name)}`); tick(); } }, 'Usar modelo ligero') : null, h('button', { class: 'btn', onclick: () => { S.lastError = null; tick(); } }, 'Descartar')));
    else banner.append(h('div', { style: 'display:flex;align-items:center;gap:10px;margin-top:12px;color:var(--mut)' }, h('span', { style: 'color:var(--ok)', html: icon('check') }), 'Todo funciona correctamente.'));
    drawRam(p); drawCpu(p); drawGpu(p); paint(); loadStorage(false);
  }
  const tm = setInterval(tick, 2500); const cl = setInterval(() => { stat.textContent = `Última comprobación: hace ${Math.max(1, Math.round((Date.now() - last) / 1000))} s`; }, 1000);
  S.cleanup = () => { clearInterval(tm); clearInterval(cl); VIEWS._perfRefresh = null; };
  invoke('sys:hw').then(r => { hw = r; if (S.lastPerf) { drawRam(S.lastPerf); drawCpu(S.lastPerf); drawGpu(S.lastPerf); } });
  await tick();
};
