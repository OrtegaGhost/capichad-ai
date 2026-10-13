// CapiChad - (c) 2026 Capibara Software (OrtegaGhost) - AGPL-3.0-or-later - https://github.com/OrtegaGhost/capichad-ai
// Aviso de autoria: conserva este encabezado y el archivo NOTICE en copias y derivados.
// ---------- Programar: bucle propio. El modelo propone archivos; el SISTEMA los escribe, ejecuta la verificación y redacta el informe ----------
VIEWS.program = async main => {
  const P = S.prog = S.prog || { folder: '', task: '', events: [], report: null, running: false, tokens: null, model: '', maxIter: 3, verify: '', library: true, web: 'auto', info: null };
  if (!VIEWS._progBound) {
    VIEWS._progBound = true;
    window.api.on('prog:event', ev => {
      const Q = S.prog; if (!Q) return;
      if (ev.t === 'tokens') Q.tokens = ev;
      else { if (ev.t === 'done') { Q.report = ev.report; Q.running = false; Q.tokens = null; } Q.events.push(ev); }
      if (S.view === 'program' && VIEWS._progDraw) VIEWS._progDraw();
    });
  }
  const models = chatModels();
  if (!P.model || !models.some(m => m.name === P.model)) P.model = roleModel('general') || (models[0] || {}).name || '';
  const v = h('div', { class: 'view' });
  v.append(head('Programar', 'Describe qué quieres. La IA escribe el código y el sistema lo comprueba de verdad: tú ves la salida real, no una promesa.'));

  // --- proyecto ---
  const folderTxt = h('span', { class: 'muted', style: 'word-break:break-all' }, P.folder || 'Ninguna carpeta elegida');
  const treeBox = h('div', { class: 'muted', style: 'margin-top:8px;white-space:pre;font:12px Consolas,monospace;max-height:120px;overflow:auto' });
  const loadInfo = async () => {
    if (!P.folder) { treeBox.textContent = ''; return; }
    P.info = await invoke('prog:info', P.folder); folderTxt.textContent = P.folder;
    treeBox.textContent = P.info ? `${P.info.files} archivo(s)\n${P.info.tree}` : 'La carpeta ya no existe.';
  };
  const pick = h('button', { class: 'btn', onclick: async () => { const f = await invoke('prog:pickFolder'); if (f) { P.folder = f; P.events = []; P.report = null; await loadInfo(); draw(); } } }, h('span', { html: icon('folder') }), 'Elegir carpeta…');
  const recent = h('select', { title: 'Proyectos recientes', onchange: async e => { if (e.target.value) { P.folder = e.target.value; P.events = []; P.report = null; await loadInfo(); draw(); } } }, h('option', { value: '' }, 'Recientes…'));
  invoke('prog:recent').then(l => l.forEach(f => recent.append(h('option', { value: f }, f.split(/[\\/]/).slice(-2).join('\\')))));
  v.append(h('div', { class: 'card' }, h('div', { class: 'toolrow', style: 'margin-top:0' }, pick, recent), h('div', { style: 'margin-top:8px' }, folderTxt), treeBox));

  // --- tarea ---
  const task = h('textarea', { rows: 4, placeholder: 'Ejemplos:\n• Crea una calculadora en Python con pruebas unittest.\n• Los tests de test_inventario.py fallan: corrige inventario.py sin modificar los tests.\n• Haz una página index.html con una galería y crea una imagen de fondo.', oninput: e => { P.task = e.target.value; } });
  task.value = P.task;
  const modelHint = () => /gpt-oss|coder/i.test(P.model) ? 'Más capaz y más lento (uno a varios minutos).' : /instruct/i.test(P.model) ? 'Rápido: ideal para tareas pequeñas (decenas de segundos).' : 'Este modelo razona antes de responder: tarda más.';
  const hint = h('span', { class: 'muted' }, modelHint());
  const msel = h('select', { title: 'Modelo', onchange: e => { P.model = e.target.value; hint.textContent = modelHint(); } }, models.map(m => h('option', { value: m.name, selected: m.name === P.model }, friendly(m.name).name)));
  const iters = h('select', { title: 'Intentos máximos', onchange: e => { P.maxIter = +e.target.value; } }, [1, 2, 3, 4, 5].map(n => h('option', { value: n, selected: n === P.maxIter }, n === 1 ? '1 intento' : n + ' intentos')));
  const ver = h('input', { type: 'text', placeholder: 'Verificar con: automático (pruebas o sintaxis)', style: 'min-width:260px;flex:1', value: P.verify, oninput: e => { P.verify = e.target.value; }, title: 'Opcional: un comando a ejecutar en la carpeta, por ejemplo  npm test  o  python main.py' });
  const lib = h('label', { class: 'muted', style: 'display:flex;gap:6px;align-items:center' }, h('input', { type: 'checkbox', checked: P.library, onchange: e => { P.library = e.target.checked; } }), 'Consultar mi biblioteca');
  const web = h('select', { title: 'Internet: busca documentación y el error cuando algo falla', onchange: e => { P.web = e.target.value; } }, [['auto', 'Internet: automático'], ['always', 'Internet: siempre'], ['never', 'Internet: no']].map(([k, l]) => h('option', { value: k, selected: k === P.web }, l)));
  const go_ = h('button', { class: 'btn pri', onclick: () => start() }, h('span', { html: icon('code') }), 'Programar');
  const stop = h('button', { class: 'btn danger', onclick: () => invoke('prog:stop') }, h('span', { html: icon('stop') }), 'Detener');
  v.append(h('div', { class: 'card', style: 'margin-top:12px' }, task,
    h('div', { class: 'toolrow' }, msel, iters, web, lib), h('div', { class: 'toolrow' }, ver), h('div', { class: 'toolrow' }, go_, stop, hint)));

  const out = h('div', {}); v.append(out);
  const start = async model => {
    if (P.running) return;
    if (!P.folder) return toast('Elige primero la carpeta del proyecto.', true);
    if (!P.task.trim()) return toast('Describe qué quieres programar.', true);
    if (model) { P.model = model; msel.value = model; hint.textContent = modelHint(); }
    P.events = []; P.report = null; P.running = true; P.tokens = null; draw();
    try { await invoke('prog:run', { folder: P.folder, task: P.task, model: P.model, verifyCmd: P.verify, maxIter: P.maxIter, library: P.library, web: P.web }); }
    catch (e) { P.running = false; P.events.push({ t: 'error', text: e.message }); }
    P.running = false; draw(); loadInfo();
  };

  const draw = () => {
    go_.disabled = P.running; stop.style.display = P.running ? '' : 'none'; go_.style.display = P.running ? 'none' : '';
    out.innerHTML = '';
    if (!P.events.length && !P.running) return;
    const tl = h('div', { class: 'card', style: 'margin-top:12px' });
    P.events.forEach((ev, i) => {
      const last = i === P.events.length - 1;
      if (ev.t === 'iter') tl.append(h('div', { style: 'margin:' + (i ? '14px' : '0') + ' 0 4px;font-weight:600' }, ev.text));
      else if (ev.t === 'phase') tl.append(h('div', { class: 'muted', style: 'padding:2px 0' }, last && P.running ? h('span', { class: 'spin' }) : h('span', { html: icon('check') }), ' ' + ev.text + (last && P.running && P.tokens ? '  ·  ' + P.tokens.n + ' tokens, ' + P.tokens.secs + ' s' : '')));
      else if (ev.t === 'files') tl.append(h('div', { style: 'padding:4px 0 4px 20px' }, ev.files.map(f => h('div', {}, h('span', { class: 'pill ' + (f.action === 'sin cambios' ? '' : 'ok'), style: 'padding:1px 8px;margin-right:8px' }, f.action), f.path + '  ', h('span', { class: 'muted' }, f.bytes + ' B')))));
      else if (ev.t === 'verify') {
        const col = ev.ok ? 'var(--ok)' : ev.level === 'ninguna' ? 'var(--mut)' : 'var(--bad)';
        tl.append(h('div', { style: 'padding:6px 0 4px 20px' },
          h('div', { style: 'font-weight:600;color:' + col }, (ev.ok ? '✔ ' : ev.level === 'ninguna' ? '' : '✘ ') + ev.text + (ev.cmd ? '  ·  ' + ev.cmd : '')),
          ev.out ? h('details', { open: !ev.ok }, h('summary', { class: 'muted' }, 'Salida real'),
            h('pre', { class: 'sel', style: 'white-space:pre-wrap;font:12px/1.45 Consolas,monospace;background:var(--bg2);border:1px solid var(--line);border-radius:8px;padding:10px;max-height:240px;overflow:auto;margin:6px 0' }, ev.out)) : null));
      }
      else if (ev.t === 'sources') tl.append(h('div', { class: 'muted', style: 'padding:2px 0 2px 20px' }, '📚 ' + ev.text + ': ' + (ev.sources || []).map(s => s.title).slice(0, 3).join(' · ')));
      else if (ev.t === 'image') tl.append(h('div', { style: 'padding:2px 0 2px 20px' }, '🖼️ ' + ev.text));
      else if (ev.t === 'warn') tl.append(h('div', { style: 'padding:2px 0 2px 20px;color:var(--warn)' }, '⚠ ' + ev.text));
      else if (ev.t === 'error') tl.append(h('div', { class: 'err', style: 'margin-top:8px' }, ev.text));
    });
    if (P.running && (!P.events.length || P.events[P.events.length - 1].t !== 'phase')) tl.append(h('div', { class: 'muted' }, h('span', { class: 'spin' }), ' Trabajando…'));
    out.append(tl);
    const r = P.report;
    if (r) {
      const strong = r.ok && ['pruebas', 'usuario', 'modelo'].includes(r.level);
      const tone = strong ? 'ok' : (r.aborted || r.ok || !r.verify || r.verify.code == null) ? 'warn' : 'bad';
      const ban = h('div', { class: 'banner ' + (tone === 'ok' ? '' : tone), style: tone === 'ok' ? 'border-color:rgba(52,211,153,.5);background:rgba(52,211,153,.07)' : '' },
        h('span', { class: 'ic', html: icon(tone === 'ok' ? 'check' : tone === 'warn' ? 'alert' : 'x') }),
        h('div', { class: 't' }, h('b', {}, r.summary),
          h('div', { class: 'muted' }, friendly(r.model).name + ' · ' + r.iterations.length + ' intento(s) · ' + r.seconds + ' s · ' + r.files.length + ' archivo(s)' + (r.verify && r.verify.label ? ' · verificación: ' + r.verify.label : '')),
          r.plan ? h('div', { class: 'muted', style: 'margin-top:4px' }, 'Plan del modelo: ' + r.plan) : null,
          ...(r.notes || []).map(n => h('div', { style: 'color:var(--warn);margin-top:2px' }, '⚠ ' + n))));
      const acts = h('div', { class: 'toolrow' },
        h('button', { class: 'btn', onclick: () => invoke('prog:open', P.folder) }, h('span', { html: icon('folder') }), 'Abrir carpeta'),
        r.files.length ? h('button', { class: 'btn', title: 'Restaura los archivos como estaban antes de esta ejecución', onclick: async () => {
          if (!await confirmBox('Deshacer cambios', 'Se restaurarán los ' + r.files.length + ' archivo(s) de esta ejecución a como estaban antes (los creados se eliminan).', 'Deshacer', true)) return;
          try { const u = await invoke('prog:undo', P.folder, r.id); toast('Listo: ' + u.restored + ' archivo(s) restaurados.'); P.report = null; P.events = []; draw(); loadInfo(); } catch (e) { toast(e.message, true); }
        } }, h('span', { html: icon('refresh') }), 'Deshacer cambios') : null,
        !r.ok && !r.aborted ? h('button', { class: 'btn pri', onclick: () => {
          const alt = roleModel('programacion') !== P.model ? roleModel('programacion') : roleModel('avanzado');
          if (!alt) return toast('No hay otro modelo de programación instalado.', true); start(alt);
        } }, h('span', { html: icon('code') }), 'Reintentar con el modelo de programación') : null);
      out.append(h('div', { style: 'margin-top:12px' }, ban, acts));
    }
  };
  VIEWS._progDraw = draw; S.cleanup = () => { VIEWS._progDraw = null; };
  main.append(v); draw(); if (P.folder) loadInfo();
};
