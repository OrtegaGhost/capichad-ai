// CapiChad - (c) 2026 Capibara Software (OrtegaGhost) - AGPL-3.0-or-later - https://github.com/OrtegaGhost/capichad-ai
// Aviso de autoria: conserva este encabezado y el archivo NOTICE en copias y derivados.
// CapiChad - pantallas
const CATALOG = [
  { name: 'qwen3:4b', size: 2.6, desc: 'Conversación y tareas cotidianas. Ligero y rápido.', tag: 'Recomendado' },
  { name: 'phi4-mini', size: 2.5, desc: 'Muy estable en equipos modestos. Respuestas cortas y rápidas.' },
  { name: 'gemma4:e4b', size: 6, desc: 'Redacta documentos y textos. También entiende imágenes.' },
  { name: 'gemma4:e2b', size: 3, desc: 'Versión más ligera para redactar textos.' },
  { name: 'dolphin-mistral', size: 4.1, desc: 'Conversación abierta y creativa, sin filtros.' },
  { name: 'GamerDevIND/HauhauCS-Gemma-4-E4B-Uncensored-Aggressive', size: 5.8, desc: 'Para crear documentos sin filtros. También entiende imágenes.' },
  { name: 'qwen2.5vl:3b', size: 3.2, desc: 'Entiende imágenes: describe fotos, capturas y diseños.' },
  { name: 'gpt-oss:20b', size: 14, desc: 'Programación: escribe y corrige código. Pesado, necesita mucha RAM.' },
  { name: 'qwen3-coder:30b', size: 18, desc: 'Programación avanzada para proyectos grandes. Muy pesado y lento.' },
  { name: 'nomic-embed-text', size: 0.3, desc: 'Mejora la búsqueda en tus documentos (se usa por detrás).' }
];
const describe = n => /embed/i.test(n) ? 'Búsqueda en tus documentos' : /coder|code/i.test(n) ? 'Ayuda para programar' : /dolphin|uncensor/i.test(n) ? 'Conversación sin censura' : 'Conversación y tareas cotidianas';
const BOXCOL = ['var(--acc)', 'var(--violet)', 'var(--ok)', 'var(--cyan)', 'var(--warn)'];
const head = (title, sub, ...acts) => h('div', { class: 'head' }, h('div', {}, h('h1', {}, title), h('p', {}, sub)), h('div', { class: 'acts' }, ...acts));
const tabs = (list, cur, fn) => h('div', { class: 'tabs' }, list.map(([k, l, ic]) => h('button', { class: cur === k ? 'on' : '', onclick: () => fn(k) }, l, ic ? h('span', { html: ' ' + icon(ic) }) : null)));
function pullArea(name) { return h('div', { class: 'progress', 'data-pull': name }, h('small', {}, ''), h('div', { class: 'bar' }, h('i', { style: 'width:0%' }))); }
VIEWS._pullDraw = d => {
  $$(`[data-pull="${CSS.escape(d.name)}"]`).forEach(el => {
    const pct = d.total ? Math.round(100 * d.completed / d.total) : 0;
    $('small', el).textContent = `${d.name} · ${d.status || ''}${d.total ? ` · ${pct}% (${gb(d.completed || 0)} / ${gb(d.total)})` : ''}`; $('i', el).style.width = (d.total ? pct : 8) + '%';
  });
};
async function downloadModel(name, btn) {
  if (S.pulls[name] && !S.pulls[name].done && S.pulls[name].active) return;
  S.pulls[name] = { name, active: true }; if (btn) btn.disabled = true;
  try { await invoke('models:pull', name); toast(`Modelo ${shortName(name)} instalado`); } catch (e) { toast('No se pudo descargar: ' + e.message, true); logl('Descarga falló: ' + e.message); }
  S.pulls[name] = { name, done: true }; if (btn) btn.disabled = false; await refreshModels(); VIEWS._modelsDraw && VIEWS._modelsDraw();
}

// ---------- historial ----------
VIEWS.history = async main => {
  await refreshChats(); const v = h('div', { class: 'view' });
  const list = h('div', {}); let q = '';
  const draw = () => {
    list.innerHTML = ''; const f = S.chats.filter(c => !q || c.title.toLowerCase().includes(q) || c.text.includes(q));
    if (!f.length) list.append(h('div', { class: 'empty' }, h('div', { class: 'big', html: icon('clock') }), q ? 'Sin resultados.' : 'Aún no hay conversaciones guardadas.'));
    f.forEach(c => list.append(h('div', { class: 'card hist', onclick: () => openChatById(c.id) }, h('span', { class: 'ic', style: 'color:var(--acc);font-size:1.4em', html: icon('chat') }),
      h('div', { class: 't' }, h('b', {}, c.pinned ? h('span', { class: 'pinmark', html: icon('pin') }) : null, c.titled ? c.title : cleanTitle(c.title)), h('span', {}, c.preview || '—')), h('span', { class: 'when' }, `${ago(c.updatedAt)} · ${c.count} mensajes`),
      h('button', { class: 'iconb' + (c.pinned ? ' pinon' : ''), title: c.pinned ? 'Quitar de fijados' : 'Fijar arriba', onclick: e => { e.stopPropagation(); togglePin(c); }, html: icon('pin') }),
      h('button', { class: 'iconb', title: 'Cambiar nombre', onclick: e => { e.stopPropagation(); renameChat(c); }, html: icon('pencil') }),
      h('button', { class: 'iconb', title: 'Eliminar', onclick: async e => { e.stopPropagation(); await invoke('chats:delete', c.id); await refreshChats(); renderSide(); draw(); }, html: icon('trash') }))));
  };
  const s = h('div', { class: 'srch' }, h('span', { html: icon('search') }), h('input', { type: 'search', placeholder: 'Buscar en tus conversaciones…', oninput: e => { q = e.target.value.toLowerCase(); draw(); } }));
  v.append(head('Historial', 'Tus conversaciones guardadas en este equipo.', s,
    h('button', { class: 'btn danger', onclick: async () => { if (await confirmBox('Borrar historial', 'Se eliminarán todas tus conversaciones de este equipo. No se puede deshacer.', 'Borrar todo', true)) { await invoke('chats:clear'); await refreshChats(); renderSide(); draw(); } } }, h('span', { html: icon('trash') }), 'Borrar todo')), list);
  main.append(v); draw();
};

// ---------- modelos ----------
VIEWS.models = async (main, tab = 'inst') => {
  const v = h('div', { class: 'view' }); main.append(v); let perf = { loaded: [] }, sys = null;
  const draw = async () => {
    await refreshModels(); [perf, sys] = await Promise.all([invoke('sys:perf'), invoke('sys:info')]); S.sys = sys; v.innerHTML = '';
    v.append(head('Modelos', 'Elige qué IA usar en tu equipo.', h('button', { class: 'btn pri', onclick: () => go('addmodel') }, h('span', { html: icon('plus') }), 'Añadir modelo')));
    v.append(tabs([['inst', 'Instalados'], ['disc', 'Descubrir', S.online ? null : 'wifioff']], tab, k => { tab = k; draw(); }));
    if (tab === 'inst') {
      const vis = visibleModels(); const total = vis.reduce((s, m) => s + m.size, 0);
      v.append(h('div', { class: 'card stat3' },
        h('div', {}, h('span', { class: 'ic', html: icon('cpu') }), h('div', {}, h('small', {}, 'Memoria disponible'), h('b', {}, gb(sys.ramFree)))),
        h('div', {}, h('span', { class: 'ic', html: icon('disk') }), h('div', {}, h('small', {}, 'Espacio usado'), h('b', {}, gb(total)))),
        h('div', {}, h('span', { class: 'ic', html: icon('box') }), h('div', {}, h('small', {}, ' '), h('b', {}, `${vis.length} modelo${vis.length === 1 ? '' : 's'} instalado${vis.length === 1 ? '' : 's'}`)))));
      if (!vis.length) v.append(h('div', { class: 'empty' }, h('div', { class: 'big', html: icon('box') }), h('div', {}, S.engine ? 'No hay modelos instalados.' : 'El motor no está activo. Revisa Rendimiento.')));
      vis.forEach((m, i) => {
        const loaded = perf.loaded.some(l => l.name === m.name || l.name.replace(/-cl:/, ':') === m.name), isDef = S.cfg.defaultModel === m.name || (!S.cfg.defaultModel && S.model === m.name);
        const pa = pullArea(m.name); const menu = h('div', { class: 'menu' }, h('button', { class: 'iconb', onclick: e => { e.stopPropagation(); menu.classList.toggle('open'); }, html: icon('dots') }),
          h('div', { class: 'pop' }, h('button', { onclick: async () => { S.cfg = await invoke('cfg:set', { defaultModel: m.name }); S.model = m.name; toast('Modelo predeterminado actualizado'); draw(); } }, 'Usar por defecto'),
            h('button', { onclick: async () => { try { const r = await invoke('models:show', m.name); infoBox(m.name, h('pre', { class: 'sel', style: 'white-space:pre-wrap;max-height:50vh;overflow:auto;font-size:.82em' }, `Familia: ${m.family || '—'}\nParámetros: ${m.params || '—'}\nCuantización: ${m.quant || '—'}\nTamaño: ${bytes(m.size)}\nContexto: ${Object.entries(r.model_info || {}).find(([k]) => k.endsWith('context_length'))?.[1] || '—'}\nCapacidades: ${(r.capabilities || []).join(', ') || '—'}`)); } catch (e) { toast(e.message, true); } } }, 'Detalles'),
            h('button', { class: 'd', onclick: async () => { if (await confirmBox('Eliminar modelo', `Se borrará "${m.name}" de este equipo (${bytes(m.size)}).`, 'Eliminar', true)) { try { await invoke('models:delete', m.name); toast('Modelo eliminado'); draw(); } catch (e) { toast(e.message, true); } } } }, 'Eliminar')));
        v.append(h('div', { class: 'card row2' }, h('div', { class: 'ic', style: `color:${BOXCOL[i % 5]}`, html: icon('box') }),
          h('div', { class: 'info' }, h('b', {}, shortName(m.name), loaded ? h('span', { class: 'tag use' }, 'En uso') : h('span', { class: 'tag ok' }, 'Listo'), isDef ? h('span', { class: 'tag warn' }, 'Predeterminado') : null), h('small', {}, friendly(m.name).desc || describe(m.name)), h('small', { class: 'dim tech' }, 'Nombre técnico: ' + technicalName(m.name))),
          h('div', { class: 'sz' }, h('span', { html: icon('cpu') }), `${m.params || '?'} · ${bytes(m.size)}`),
          loaded ? h('button', { class: 'btn', onclick: async () => { await invoke('models:stop', m.name); draw(); } }, 'Detener') : h('button', { class: 'btn pri', onclick: async () => { S.model = m.name; S.cfg = await invoke('cfg:set', { defaultModel: m.name }); toast(`Usando ${shortName(m.name)}`); draw(); } }, 'Usar modelo'), menu));
      });
      v.append(h('div', { class: 'banner' }, h('span', { class: 'ic', html: icon('lock') }), h('div', { class: 't' }, h('b', {}, 'Los modelos instalados funcionan sin internet.'), h('div', { class: 'muted' }, 'Puedes añadir otros desde un archivo local.'))));
    } else {
      if (!S.online) v.append(h('div', { class: 'banner warn' }, h('span', { class: 'ic', html: icon('wifioff') }), h('div', { class: 't' }, h('b', {}, 'Sin conexión'), h('div', { class: 'muted' }, 'Conéctate a internet para descargar modelos nuevos. Lo que ya tienes sigue funcionando.'))));
      CATALOG.forEach(c => {
        const have = S.models.some(m => m.name === c.name || m.name === c.name + ':latest'), heavy = c.size * 1.3 > sys.ramTotal / 1073741824 * 0.75; const btn = h('button', { class: 'btn pri', disabled: have || !S.online, onclick: () => downloadModel(c.name, btn) }, have ? 'Instalado' : 'Descargar');
        v.append(h('div', { class: 'card row2' }, h('div', { class: 'ic', html: icon('box') }), h('div', { class: 'info' }, h('b', {}, shortName(c.name), c.tag ? h('span', { class: 'tag use' }, c.tag) : null, heavy ? h('span', { class: 'tag bad' }, 'Pesado para tu equipo') : null), h('small', {}, c.desc), pullArea(c.name)),
          h('div', { class: 'sz' }, `~${c.size} GB`), btn));
      });
      v.append(h('div', { class: 'muted', style: 'margin-top:8px' }, 'Los tamaños son aproximados. ¿Buscas otro modelo? Escribe su nombre en “Añadir modelo”.'));
    }
  };
  VIEWS._modelsDraw = () => { if (S.view === 'models') draw(); };
  S.cleanup = () => { VIEWS._modelsDraw = null; }; await draw();
};

// ---------- añadir / preparar modelo ----------
function askName(def) {
  return new Promise(res => {
    const inp = h('input', { type: 'text', value: def }); const done = v => { m.remove(); res(v); };
    const m = h('div', { class: 'modal' }, h('div', { class: 'box' }, h('h3', {}, 'Nombre del modelo'), h('div', { class: 'muted', style: 'margin-bottom:10px' }, 'Cómo quieres llamarlo en tu lista (minúsculas, sin espacios).'), inp,
      h('div', { class: 'acts' }, h('button', { class: 'btn', onclick: () => done(null) }, 'Cancelar'), h('button', { class: 'btn pri', onclick: () => done(inp.value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-') || null) }, 'Importar')))); document.body.append(m); inp.focus(); inp.select();
  });
}
function addModelPanel(wizard) {
  const wrap = h('div', {}); const status = h('div', {});
  const sys = S.sys; const sel = h('select', {}, CATALOG.filter(c => !/embed/.test(c.name)).map(c => h('option', { value: c.name }, `${shortName(c.name)} · ${technicalName(c.name)} (~${c.size} GB)`)));
  const custom = h('input', { type: 'text', placeholder: 'o escribe el nombre exacto, p. ej. llama3.2:3b' });
  const dl = h('button', { class: 'btn pri', style: 'width:100%;margin-top:12px', disabled: !S.online, onclick: () => { const n = custom.value.trim() || sel.value; status.innerHTML = ''; status.append(pullArea(n)); downloadModel(n, dl).then(() => wizard && wizard()); } }, S.online ? 'Descargar' : 'Sin conexión');
  const imp = h('button', { class: 'btn pri', style: 'width:100%;margin-top:14px;padding:11px', onclick: async () => {
    const f = await invoke('models:pickFile'); if (!f) return; const base = f.split(/[\\/]/).pop().replace(/\.gguf$/i, '').toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
    const n = await askName(base); if (!n) return; status.innerHTML = ''; status.append(pullArea(n));
    try { await invoke('models:import', f, n); toast('Modelo importado'); await refreshModels(); wizard && wizard(); } catch (e) { toast('No se pudo importar: ' + e.message, true); } } }, 'Elegir archivo');
  wrap.append(h('div', { class: 'two' },
    h('div', { class: 'card', style: 'border-color:var(--acc)' }, h('div', { style: 'display:flex;gap:14px;align-items:center' }, h('span', { style: 'font-size:2.4em;color:var(--acc)', html: icon('folder') }), h('div', {}, h('b', { style: 'font-size:1.15em' }, 'Importar desde mi equipo'), h('div', { class: 'muted' }, 'Usa un archivo de modelo (.gguf) que ya tengas.'))), imp, h('div', { class: 'muted', style: 'margin-top:8px' }, 'También puedes usar una memoria USB.')),
    h('div', { class: 'card' }, h('div', { style: 'display:flex;gap:14px;align-items:center' }, h('span', { style: 'font-size:2.4em', html: icon('download') }), h('div', {}, h('b', { style: 'font-size:1.15em' }, 'Descargar un modelo'), h('div', { class: 'muted' }, 'Necesita internet para la descarga inicial.'))), h('div', { style: 'margin-top:12px;display:grid;gap:8px' }, sel, custom), dl)),
    status, h('div', { class: 'banner', style: 'margin-top:14px' }, h('span', { class: 'ic', html: icon('info') }), h('div', { class: 't' }, 'Una vez instalado el modelo, podrás conversar sin internet.')));
  return wrap;
}
VIEWS.addmodel = async main => {
  S.sys = await invoke('sys:info'); const v = h('div', { class: 'view' });
  v.append(head('Añadir modelo', 'Importa un archivo o descarga uno nuevo.', h('button', { class: 'btn', onclick: () => go('models') }, 'Volver')), addModelPanel(() => go('models')));
  main.append(v);
};

// ---------- asistente de preparación ----------
VIEWS.setup = async (main, step = 1) => {
  S.sys = await invoke('sys:info'); const st = await invoke('ollama:status'); S.installed = st.installed; S.engine = st.running; await refreshModels();
  const v = h('div', { class: 'view' }); const sys = S.sys;
  v.append(h('div', { style: 'text-align:center' }, h('h1', { style: 'margin:0;font-size:2em' }, 'Prepara CapiChad'), h('p', { class: 'muted' }, step === 1 ? 'Revisamos tu equipo.' : step === 2 ? 'Elige qué instalar: preseleccionamos lo que le alcanza a tu equipo.' : 'Todo listo.')));
  v.append(h('div', { class: 'steps' }, [['Equipo', 1], ['Plan', 2], ['Listo', 3]].flatMap(([l, n], i) => [i ? h('div', { class: 'ln' + (step >= n ? ' on' : '') }) : null, h('div', { class: 's' + (step >= n ? ' on' : '') }, h('i', {}, step > n ? '✓' : n), l)]).filter(Boolean)));
  const box = h('div', { style: 'max-width:900px;margin:0 auto;width:100%' });
  const info = h('div', { class: 'card stat3', style: 'margin-bottom:14px' },
    h('div', {}, h('span', { class: 'ic', html: icon('cpu') }), h('div', {}, h('small', {}, 'Memoria'), h('b', {}, gb(sys.ramTotal)))),
    h('div', {}, h('span', { class: 'ic', html: icon('disk') }), h('div', {}, h('small', {}, 'Espacio libre'), h('b', {}, gb(sys.disk)))),
    h('div', {}, h('span', { class: 'ic', html: icon('gpu') }), h('div', {}, h('small', {}, 'Tarjeta gráfica'), h('b', {}, gpuLabel({ gpuPrimary: sys.platform && sys.platform.gpuPrimary, gpu: sys.gpu ? { name: sys.gpu.name, vramGB: sys.gpu.vramTotal } : null })[0]))));
  box.append(h('div', { class: 'card', style: 'margin-bottom:14px;display:flex;align-items:center;gap:14px' }, h('span', { style: 'font-size:2em;color:var(--acc)', html: icon('cpu') }), h('b', {}, 'Equipo detectado'), h('span', { class: 'muted' }, sys.cpu)), info);
  if (step === 1) {
    if (!st.installed) box.append(h('div', { class: 'banner bad' }, h('span', { class: 'ic', html: icon('alert') }), h('div', { class: 't' }, h('b', {}, 'Falta el motor de IA (Ollama)'), h('div', { class: 'muted' }, 'CapiChad lo usa para ejecutar los modelos. Instálalo (una sola vez, necesita internet) y vuelve aquí.')),
      (() => {
        const info = h('div', { class: 'muted', style: 'margin-top:6px' });
        const b = h('button', { class: 'btn pri', onclick: async () => {
          b.disabled = true; info.textContent = 'Descargando el motor de IA… (≈1.5 GB)';
          const off = window.api.on('plan:event', e => { if (e.t === 'item' && e.id === 'ollama:setup' && e.bytes) info.textContent = `Descargando el motor de IA… ${Math.round(100 * e.done / e.bytes)} %${e.bps ? ' · ' + (e.bps / 1048576).toFixed(1) + ' MB/s' : ''}${e.state === 'verifying' ? ' · verificando' : ''}`; });
          try { const r = await invoke('ollama:autoInstall'); off(); if (r.installed) { toast('Motor de IA instalado.'); go('setup', 1); } else { info.textContent = 'No se pudo completar la instalación. Usa «Descargar Ollama».'; b.disabled = false; } }
          catch (e) { off(); info.textContent = 'Error: ' + e.message; b.disabled = false; }
        } }, 'Instalar automáticamente');
        return h('div', {}, b, info);
      })(),
      h('button', { class: 'btn', onclick: () => invoke('ollama:openDownload') }, 'Descargar Ollama'),
      h('button', { class: 'btn', title: 'Si tienes OllamaSetup.exe (paquete offline o memoria USB)', onclick: async () => { toast('Instalando el motor de IA…'); try { const r = await invoke('ollama:installFrom'); if (r.cancelled) return; toast(r.installed ? 'Motor de IA instalado' : 'No se pudo instalar el motor', !r.installed); go('setup', 1); } catch (e) { toast(e.message, true, 8000); } } }, 'Instalar desde archivo…'),
      h('button', { class: 'btn', onclick: () => go('setup', 1) }, 'Ya lo instalé')));
    else box.append(h('div', { class: 'banner' }, h('span', { class: 'ic', style: 'color:var(--ok)', html: icon('check') }), h('div', { class: 't' }, h('b', {}, 'Motor de IA encontrado'), h('div', { class: 'muted' }, st.running ? 'Está en marcha.' : 'Se iniciará automáticamente.'))));
    box.append(h('div', { style: 'display:flex;justify-content:flex-end;margin-top:18px' }, h('button', { class: 'btn pri', disabled: !st.installed, onclick: () => go('setup', 2) }, 'Continuar')));
  } else if (step === 2) {
    const planBox = h('div', {}); box.append(planBox);
    renderPlan(planBox, { wizard: true });
    box.append(h('div', { style: 'display:flex;justify-content:space-between;margin-top:18px;gap:10px;flex-wrap:wrap' }, h('button', { class: 'btn', onclick: () => go('setup', 1) }, 'Atrás'),
      h('div', { style: 'display:flex;gap:10px' }, h('button', { class: 'btn', title: 'Importar un archivo .gguf o elegir un modelo a mano', onclick: () => go('addmodel') }, 'Añadir un modelo a mano'),
        h('button', { class: 'btn', onclick: () => go('setup', 3) }, 'Omitir por ahora'))));
  } else {
    box.append(h('div', { class: 'card', style: 'text-align:center;padding:30px' }, h('div', { style: 'font-size:3em;color:var(--ok)', html: icon('check') }), h('h2', {}, '¡Listo!'), h('div', { class: 'muted' }, S.models.length ? `Tienes ${S.models.length} modelo(s). Ya puedes conversar sin internet.` : 'Puedes añadir un modelo cuando quieras desde Modelos.'),
      h('button', { class: 'btn pri', style: 'margin-top:18px;padding:11px 28px', onclick: async () => { S.cfg = await invoke('cfg:set', { setupDone: true }); go('home'); } }, 'Empezar')));
  }
  v.append(box); main.append(v); VIEWS._modelsDraw = () => { if (S.view === 'setup') go('setup', S.models.length ? 3 : 2); }; S.cleanup = () => { VIEWS._modelsDraw = null; };
};

// ---------- documentos ----------
VIEWS.documents = async main => {
  await refreshDocs(); const v = h('div', { class: 'view' }); let q = ''; const list = h('div', {});
  const add = async files => { if (!files.length) return; toast(`Procesando ${files.length} archivo(s)…`); for (const f of files) { invoke('docs:add', [f]).then(r => { if (r[0]?.status === 'error') toast(`${r[0].name}: ${r[0].error}`, true, 6000); }); } setTimeout(async () => { await refreshDocs(); draw(); }, 400); };
  const draw = () => {
    list.innerHTML = ''; const f = S.docs.filter(d => !q || d.name.toLowerCase().includes(q));
    if (!f.length) list.append(h('div', { class: 'empty' }, q ? 'Sin resultados.' : 'Aún no tienes documentos. Añade PDF, Word o texto y pregúntale a la IA sobre ellos.'));
    f.forEach(d => list.append(h('div', { class: 'card row2' }, h('div', { class: 'ic', style: 'color:#e5484d', html: icon('file') }),
      h('div', { class: 'info' }, h('b', {}, d.name, h('span', { class: 'tag ' + (d.status === 'listo' ? 'ok' : d.status === 'error' ? 'bad' : 'warn') }, d.status === 'listo' ? 'Listo' : d.status === 'error' ? 'Error' : `Indexando${d.progress != null ? ' ' + d.progress + '%' : '…'}`)),
        h('small', {}, d.status === 'error' ? d.error : `${d.pages} pág. · ${d.chunks} fragmentos · ${bytes(d.size)} · ${d.embedded ? 'búsqueda por significado' : 'búsqueda por palabras'}`)),
      h('button', { class: 'btn', disabled: d.status !== 'listo', onclick: () => newChat({ assistant: byName('Mis documentos'), docs: true, docIds: [d.id] }) }, 'Preguntar'),
      h('button', { class: 'iconb', title: 'Abrir', onclick: () => invoke('docs:open', d.id), html: icon('folder') }),
      h('button', { class: 'iconb', title: 'Eliminar', onclick: async () => { if (await confirmBox('Eliminar documento', `Se quitará "${d.name}" de tu biblioteca.`, 'Eliminar', true)) { await invoke('docs:remove', d.id); await refreshDocs(); draw(); } }, html: icon('trash') }))));
  };
  VIEWS._docsDraw = draw; S.cleanup = () => { VIEWS._docsDraw = null; };
  const drop = h('div', { class: 'drop' }, h('div', { style: 'font-size:2em', html: icon('upload') }), h('div', {}, 'Arrastra archivos aquí o '), h('button', { class: 'btn pri', style: 'margin-top:10px', onclick: async () => add(await invoke('docs:pick')) }, 'Elegir archivos'), h('div', { class: 'dim', style: 'margin-top:8px;font-size:.85em' }, 'PDF, Word (.docx), texto, Markdown, código… Se procesan en tu equipo.'));
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); }); drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); add([...e.dataTransfer.files].map(f => window.api.pathOf(f)).filter(Boolean)); });
  const s = h('div', { class: 'srch' }, h('span', { html: icon('search') }), h('input', { type: 'search', placeholder: 'Buscar documentos…', oninput: e => { q = e.target.value.toLowerCase(); draw(); } }));
  v.append(head('Documentos', 'Archivos que la IA puede consultar, todo en tu equipo.', s), drop, h('div', { style: 'height:16px' }), list); main.append(v); draw();
  if (!S.models.some(m => /embed/i.test(m.name))) v.append(h('div', { class: 'banner' }, h('span', { class: 'ic', html: icon('info') }), h('div', { class: 't' }, 'Usando búsqueda por palabras. Para búsqueda por significado, instala “nomic-embed-text” (0.3 GB) desde Modelos → Descubrir y vuelve a añadir tus documentos.')));
};


// ---------- biblioteca (libros indexados) ----------
VIEWS.library = async main => {
  const v = h('div', { class: 'view' }); const body = h('div', {}); let prog = null, ocrp = null;
  const draw = async () => {
    const st = await invoke('kb:status'); body.innerHTML = '';
    body.append(h('div', { class: 'card stat4' },
      h('div', {}, h('small', {}, 'Libros'), h('b', {}, String(st.libros || 0))), h('div', {}, h('small', {}, 'Páginas'), h('b', {}, (st.paginas || 0).toLocaleString('es-MX'))),
      h('div', {}, h('small', {}, 'Fragmentos'), h('b', {}, (st.fragmentos || 0).toLocaleString('es-MX'))), h('div', {}, h('small', {}, 'Escaneados (falta OCR)'), h('b', {}, st.necesitan_ocr ? `${st.necesitan_ocr.libros} libros` : '0'))));
    body.append(h('div', { class: 'card', style: 'display:flex;gap:14px;align-items:center;margin-top:12px' }, h('span', { class: 'ic', style: 'font-size:1.6em', html: icon('folder') }),
      h('div', { style: 'flex:1' }, h('b', {}, 'Enciclopedias y documentación sin conexión (.zim)'),
        h('div', { class: 'muted' }, 'Descarga archivos .zim (Wikipedia, DevDocs, Stack Exchange…) desde library.kiwix.org y cópialos en la carpeta de la biblioteca; se usan solos en cada pregunta.')),
      h('button', { class: 'btn', onclick: () => invoke('kb:openLibFolder') }, 'Abrir carpeta')));
    if (st.necesitan_ocr?.libros > 0 && !st.ocring && !ocrp) body.append(h('div', { class: 'card', style: 'display:flex;gap:14px;align-items:center' }, h('span', { class: 'ic', style: 'font-size:1.8em;color:var(--warn)', html: icon('alert') }),
      h('div', { style: 'flex:1' }, h('b', {}, `${st.necesitan_ocr.libros} libros escaneados no se pueden buscar`), h('div', { class: 'muted' }, `Tienen ${st.necesitan_ocr.paginas.toLocaleString('es-MX')} páginas que son imágenes. El OCR las convierte en texto (tarda alrededor de una hora y puedes seguir usando CapiChad).`)),
      h('button', { class: 'btn pri', onclick: () => runOcr() }, 'Hacer OCR ahora')));
    if (st.ocring || ocrp) body.append(h('div', { class: 'card' }, h('b', {}, 'Leyendo libros escaneados (OCR)…'), h('div', { class: 'bar', style: 'margin:8px 0' }, h('i', { style: `width:${ocrp && ocrp.of ? Math.round(100 * (ocrp.page_batch || 0) / ocrp.of) : 5}%` })),
      h('small', { class: 'muted' }, ocrp && ocrp.book ? `${ocrp.book}${ocrp.of ? ' · ' + (ocrp.page_batch || 0) + ' de ' + ocrp.of + ' páginas' : ''}` : 'Preparando…')));
    if (st.ingesting || prog) body.append(h('div', { class: 'card' }, h('b', {}, 'Indexando…'), h('div', { class: 'bar', style: 'margin:8px 0' }, h('i', { style: `width:${prog ? Math.round(100 * prog.n / prog.total) : 5}%` })), h('small', { class: 'muted' }, prog ? `${prog.n} de ${prog.total} · ${prog.book}` : 'Preparando…')));
    const tp = Object.entries(st.temas || {}).sort((a, b) => b[1] - a[1]);
    if (tp.length) body.append(h('div', { class: 'card' }, h('b', {}, 'Temas'), h('div', { class: 'chips', style: 'margin-top:8px' }, tp.map(([t, n]) => h('span', { class: 'chip' }, `${t} · ${n}`)))));
    body.append(h('div', { class: 'card' }, h('b', {}, '¿Cómo la usa la IA?'), h('p', { class: 'muted', style: 'margin:6px 0 0' }, 'En cada pregunta busca en estos libros y usa lo que encuentra para responderte, citando el libro y la página. Desde la cita puedes abrir la página original con sus figuras. Con el botón “Biblioteca” del chat la activas o desactivas.')));
    const q = h('input', { type: 'search', placeholder: 'Probar una búsqueda en tus libros…', style: 'flex:1' }); const out = h('div', { style: 'margin-top:10px' });
    const go1 = async () => { out.innerHTML = ''; if (!q.value.trim()) return; const r = await invoke('kb:search', q.value, 6); if (!r.length) out.append(h('div', { class: 'muted' }, 'Sin resultados relevantes.')); r.forEach(x => out.append(h('div', { class: 'src', onclick: () => infoBox(x.title + (x.page ? ' · p. ' + x.page : ''), h('div', { class: 'sel', style: 'max-height:50vh;overflow:auto;white-space:pre-wrap' }, x.text)) }, h('span', { style: 'color:#e5484d', html: icon('file') }), h('div', { class: 't' }, h('b', {}, x.kind === 'zim' ? `${x.title} · ${x.topic}` : `${x.title} · p. ${x.page}`), h('span', {}, x.text.slice(0, 110) + '…')), h('span', { class: 'dim', html: icon('right') })))); };
    q.addEventListener('keydown', e => e.key === 'Enter' && go1());
    body.append(h('div', { class: 'card' }, h('b', {}, 'Buscar'), h('div', { style: 'display:flex;gap:8px;margin-top:8px' }, q, h('button', { class: 'btn', onclick: go1 }, 'Buscar')), out));
    if ((st.folders || []).length) body.append(h('div', { class: 'card' }, h('b', {}, 'Carpetas indexadas'), (st.folders || []).map(f => h('div', { class: 'muted', style: 'margin-top:6px' }, f))));
    body.append(h('div', { class: 'dim', style: 'font-size:.82em;margin:6px 4px' }, 'Base de datos: ' + st.db));
  };
  const add = h('button', { class: 'btn pri', onclick: async () => { const f = await invoke('kb:pickFolder'); if (!f) return; toast('Indexando la carpeta…'); invoke('kb:ingest', f).then(() => { prog = null; toast('Biblioteca actualizada'); draw(); }).catch(e => { prog = null; toast(e.message, true, 7000); draw(); }); setTimeout(draw, 600); } }, h('span', { html: icon('plus') }), 'Añadir carpeta de libros');
  const off = window.api.on('kb:progress', d => { prog = d.done ? null : d; if (S.view === 'library' && (d.done || d.n % 8 === 0)) draw(); });
  const runOcr = () => { ocrp = { book: 'Preparando…' }; draw(); invoke('kb:ocr').then(r => { ocrp = null; toast(`OCR terminado: ${r?.paginas || 0} páginas leídas`); if (S.view === 'library') draw(); }).catch(e => { ocrp = null; toast(e.message, true, 8000); if (S.view === 'library') draw(); }); };
  const offOcr = window.api.on('kb:ocrprogress', d => { if (d.done) return; ocrp = d; if (S.view === 'library' && d.page_batch !== undefined) draw(); });
  S.cleanup = () => { off(); offOcr(); };
  v.append(head('Biblioteca', 'Tus libros y manuales, indexados para que la IA los consulte sola.', add), body); main.append(v); draw();
};

// ---------- imágenes ----------
VIEWS.images = async main => {
  const st = await invoke('tool:status'); const v = h('div', { class: 'view' });
  v.append(head('Imágenes', 'Crea imágenes con la IA de tu equipo, sin internet. Cada una tarda de 15 a 60 segundos.'));
  if (!st.image) v.append(h('div', { class: 'banner warn' }, h('span', { class: 'ic', html: icon('alert') }), h('div', { class: 't' }, h('b', {}, 'El generador de imágenes no está instalado en este equipo'), h('div', { class: 'muted' }, 'Necesita el motor de imágenes local (Python 3.10 a 3.13 de 64 bits). Con tarjeta NVIDIA usa la GPU (~7 GB, una sola vez); con AMD, Intel o solo procesador usa la CPU (~5 GB) y cada imagen tarda de 1 a 3 minutos.'),
    st.imageInstaller ? h('button', { class: 'btn pri', style: 'margin-top:10px', onclick: async () => { try { await invoke('tool:installImageEngine'); toast('Se abrió una ventana que instala el motor. Cuando termine, reabre esta sección.'); } catch (e) { toast(e.message, true); } } }, h('span', { html: icon('download') }), 'Instalar el motor de imágenes') : null)));
  const prompt = h('textarea', { rows: 3, placeholder: 'Describe lo que quieres ver… por ejemplo: «un gato astronauta en la luna, estilo acuarela»' });
  const size = h('select', {}, [['512x512', 'Cuadrada · 512×512'], ['512x768', 'Vertical · 512×768'], ['768x512', 'Horizontal · 768×512']].map(([k, l]) => h('option', { value: k }, l)));
  const cant = h('select', {}, [1, 2, 3, 4].map(n => h('option', { value: n }, n === 1 ? '1 imagen' : n + ' imágenes')));
  const seed = h('input', { type: 'number', placeholder: 'Semilla (opcional)', style: 'width:150px' });
  const tr = h('input', { type: 'checkbox', checked: true });
  let ref = null; const refInfo = h('span', { class: 'muted' }, 'Sin imagen de referencia');
  const strength = h('input', { type: 'range', min: 0.3, max: 0.9, step: 0.05, value: 0.6, style: 'width:140px;display:none' });
  const refBtn = h('button', { class: 'btn sm', title: 'Parte de una imagen tuya y la transforma', onclick: async () => {
    if (ref) { ref = null; refInfo.textContent = 'Sin imagen de referencia'; refBtn.textContent = 'Elegir referencia…'; strength.style.display = 'none'; return; }
    const f = await invoke('tool:pickFile', 'image'); if (!f) return; ref = f; refInfo.textContent = f.split(/[\\/]/).pop(); refBtn.textContent = 'Quitar referencia'; strength.style.display = '';
  } }, 'Elegir referencia…');
  // referencias de internet: fotos con licencia abierta (Openverse / Wikimedia); si no hay conexión el botón avisa
  const webRefBtn = h('button', { class: 'btn sm', title: 'Busca fotos con licencia abierta en internet y úsalas como referencia', onclick: async () => {
    const q = prompt.value.trim(); if (!q) return toast('Escribe primero qué quieres buscar en el cuadro de descripción.', true);
    webRefBtn.disabled = true; webRefBtn.textContent = 'Buscando…';
    try {
      const items = await invoke('web:images', q, 8);
      if (!items.length) return toast('No se encontraron imágenes con licencia abierta.', true);
      const grid = h('div', { class: 'imggrid' });
      items.forEach(it => grid.append(h('div', { class: 'imgcard' },
        h('img', { src: it.thumb_b64, alt: '', title: 'Usar como referencia', onclick: async () => {
          grid.closest('.modal')?.remove(); toast('Descargando la referencia…');
          try { ref = await invoke('web:useImage', it.url); refInfo.textContent = `Internet · ${it.license || 'licencia abierta'}${it.creator ? ' · ' + it.creator : ''}`; refBtn.textContent = 'Quitar referencia'; strength.style.display = ''; }
          catch (e) { toast('No se pudo descargar: ' + e.message, true); }
        } }),
        h('div', { class: 'imgmeta' }, h('span', { class: 'muted', title: it.title }, `${it.license || ''} · ${(it.creator || it.source || '').slice(0, 28)}`)))));
      infoBox('Referencias de internet', h('div', {}, h('div', { class: 'muted', style: 'margin-bottom:8px' }, 'Fotos con licencia Creative Commons. Elige una para usarla como referencia (se transforma con tu descripción).'), grid));
    } catch (e) { toast(e.message, true); }
    finally { webRefBtn.disabled = false; webRefBtn.textContent = 'Buscar en internet…'; }
  } }, 'Buscar en internet…');
  const results = h('div', { class: 'imggrid' }); const msg = h('div', {}); const gallery = h('div', { class: 'imggrid' });
  const open = async f => { const s = await invoke('img:view', f); if (s) infoBox('Imagen', h('div', {}, h('img', { src: s, style: 'max-width:100%;border-radius:10px' }), h('div', { style: 'margin-top:8px;display:flex;gap:8px' }, h('button', { class: 'btn sm', onclick: () => invoke('tool:reveal', f) }, 'Mostrar archivo')))); };
  const card = (it, withDel) => { const im = h('img', { alt: '' }); invoke('img:thumb', it.file, 320).then(s => { if (s) im.src = s; }); im.onclick = () => open(it.file);
    return h('div', { class: 'imgcard' }, im, h('div', { class: 'imgmeta' }, h('span', { class: 'muted', title: it.prompt || '' }, (it.prompt || 'Imagen').slice(0, 60)),
      h('span', { class: 'imgact' }, it.prompt ? h('button', { class: 'iconb sm', title: 'Reutilizar descripción', onclick: () => { prompt.value = it.prompt; prompt.focus(); window.scrollTo(0, 0); }, html: icon('pencil') }) : null,
        h('button', { class: 'iconb sm', title: 'Mostrar archivo', onclick: () => invoke('tool:reveal', it.file), html: icon('folder') }),
        withDel ? h('button', { class: 'iconb sm', title: 'Eliminar', onclick: async () => { if (await confirmBox('Eliminar imagen', 'Se borrará del equipo.', 'Eliminar', true)) { await invoke('img:delete', it.file); loadGallery(); } }, html: icon('trash') }) : null))); };
  const loadGallery = async () => { const l = await invoke('img:list'); gallery.innerHTML = ''; if (!l.length) gallery.append(h('div', { class: 'muted' }, 'Aún no has creado imágenes.')); l.forEach(it => gallery.append(card(it, true))); };
  const btn = h('button', { class: 'btn pri', disabled: !st.image, onclick: async () => {
    const p = prompt.value.trim(); if (!p) return toast('Escribe qué imagen quieres.', true);
    if (S.imgBusy) return toast('Ya se está creando otra imagen. Espera a que termine.', true);
    S.imgBusy = true; btn.disabled = true; const [w, hh] = size.value.split('x').map(Number); const t0 = Date.now(); const n = +cant.value;
    const tick = setInterval(() => { msg.querySelector('.t') && (msg.querySelector('.t').textContent = `Creando ${n > 1 ? n + ' imágenes' : 'la imagen'}… ${Math.round((Date.now() - t0) / 1000)} s`); }, 1000);
    msg.innerHTML = ''; msg.append(h('div', { class: 'card', style: 'display:flex;gap:12px;align-items:center' }, h('span', { class: 'spin' }), h('span', { class: 't' }, 'Preparando…')));
    try { const r = await invoke('img:generate', p, { n, w, h: hh, seed: seed.value, translate: tr.checked, ref, strength: strength.value });
      msg.innerHTML = ''; results.innerHTML = ''; r.items.forEach(it => results.append(card({ file: it.file, prompt: p }, false)));
      msg.append(h('div', { class: 'muted' }, `Listo en ${Math.round(r.seconds)} s${r.used && r.used !== p ? ' · descripción usada: «' + r.used.slice(0, 120) + '»' : ''}`)); loadGallery();
    } catch (e) { msg.innerHTML = ''; msg.append(h('div', { class: 'err' }, e.message)); }
    clearInterval(tick); S.imgBusy = false; btn.disabled = !st.image;
  } }, h('span', { html: icon('image') }), 'Crear imagen');
  v.append(h('div', { class: 'card' }, prompt,
    h('div', { class: 'toolrow' }, size, cant, seed, h('label', { class: 'muted', style: 'display:flex;gap:6px;align-items:center' }, tr, 'Traducir al inglés'), h('span', { class: 'sp', style: 'flex:1' }), btn),
    h('div', { class: 'toolrow' }, refBtn, S.online === false ? null : webRefBtn, refInfo, strength)));
  v.append(msg, results, h('h3', { style: 'margin:18px 4px 8px' }, 'Tus imágenes'), gallery);
  main.append(v); loadGallery();
};

// ---------- herramientas ----------
VIEWS.tools = async main => {
  const st = await invoke('tool:status'); const v = h('div', { class: 'view' });
  v.append(head('Herramientas', 'Utilidades que funcionan sin internet, en tu equipo.'));
  const tile = (ic, title, desc, ok, ...body) => h('div', { class: 'card tool' }, h('div', { class: 'top' }, h('div', { class: 'ic', html: icon(ic) }), h('b', {}, title), ok ? null : h('span', { class: 'tag bad' }, 'No instalada')), h('p', { class: 'muted' }, desc), ...body);
  const busy = (box, txt) => { box.innerHTML = ''; box.append(h('div', { class: 'muted' }, h('span', { class: 'spin' }), ' ' + txt)); };
  const fail = (box, e) => { box.innerHTML = ''; box.append(h('div', { class: 'err' }, e.message)); };
  const done = (box, r, label) => { box.innerHTML = ''; if (r.preview) box.append(h('img', { class: 'toolimg', src: r.preview }));
    box.append(h('div', { class: 'toolact' }, h('span', { class: 'muted' }, label), h('button', { class: 'btn sm', onclick: () => invoke('tool:reveal', r.file) }, h('span', { html: icon('folder') }), 'Mostrar archivo'))); };
  const run = async (box, txt, fn, label) => { busy(box, txt); try { done(box, await fn(), label); } catch (e) { fail(box, e); } };

  // quitar fondo
  const bgOut = h('div', { class: 'toolout' });
  const bg = tile('image', 'Quitar fondo', 'Elige una imagen y obtén un PNG con el fondo transparente.', st.bgremove, h('div', { class: 'toolrow' },
    h('button', { class: 'btn pri', disabled: !st.bgremove, onclick: async () => { const f = await invoke('tool:pickFile', 'image'); if (f) run(bgOut, 'Quitando el fondo…', async () => { const r = await invoke('tool:bgremove', f); r.l = `Listo en ${r.seconds} s`; return r; }, 'Fondo quitado'); } }, 'Elegir imagen…')), bgOut);

  // convertir documentos
  const cvOut = h('div', { class: 'toolout' }); const fmt = h('select', { style: 'width:auto' }, [['pdf', 'PDF'], ['docx', 'Word (.docx)'], ['txt', 'Texto (.txt)']].map(([k, l]) => h('option', { value: k }, l)));
  const cv = tile('file', 'Convertir documentos', 'Pasa Word, Excel o PowerPoint a PDF u otros formatos, con LibreOffice.', st.convert, h('div', { class: 'toolrow' }, fmt,
    h('button', { class: 'btn pri', disabled: !st.convert, onclick: async () => { const f = await invoke('tool:pickFile', 'doc'); if (f) run(cvOut, 'Convirtiendo…', () => invoke('tool:convert', f, fmt.value), 'Documento convertido'); } }, 'Elegir documento…')), cvOut);

  // crear imagen: tiene su propia sección en el menú
  const im = tile('image', 'Crear imagen', 'Genera imágenes con la IA de tu equipo, con galería y referencia.', st.image,
    h('div', { class: 'toolrow' }, h('button', { class: 'btn pri', onclick: () => go('images') }, 'Ir a Imágenes')));

  // OCR (se hace desde Biblioteca)
  const ocr = tile('book', 'Leer libros escaneados (OCR)', 'Convierte en texto las páginas escaneadas de tus libros para poder buscarlas.', st.ocr,
    h('div', { class: 'toolrow' }, h('button', { class: 'btn', onclick: () => go('library') }, 'Ir a Biblioteca')));
  v.append(h('div', { class: 'grid cards2' }, bg, cv, im, ocr));
  v.append(h('div', { class: 'dim', style: 'font-size:.82em;margin:10px 4px' }, 'Los resultados se guardan en: ' + st.dir));
  main.append(v);
};

// ---------- asistentes ----------
VIEWS.assistants = async main => {
  await refreshAssistants(); const v = h('div', { class: 'view' });
  v.append(head('Asistentes', 'Personaliza cómo responde tu IA.', h('button', { class: 'btn pri', onclick: () => go('assistant-edit', null) }, h('span', { html: icon('plus') }), 'Nuevo asistente')));
  const g = h('div', { class: 'grid cards3' });
  S.assistants.forEach(a => g.append(h('div', { class: 'card acard', onclick: () => go('assistant-edit', a.id) }, h('div', { class: 'top' }, h('div', { class: 'ic', html: icon(a.useDocs ? 'file' : /prog|python/i.test(a.name) ? 'code' : 'user') }), h('b', {}, a.name)), h('p', {}, a.desc || 'Sin descripción'),
    h('div', { style: 'display:flex;gap:8px' }, h('button', { class: 'btn sm pri', onclick: e => { e.stopPropagation(); newChat({ assistant: a }); } }, 'Usar'), h('button', { class: 'btn sm', onclick: e => { e.stopPropagation(); go('assistant-edit', a.id); } }, 'Editar')))));
  v.append(g); main.append(v);
};
VIEWS['assistant-edit'] = async (main, id) => {
  await refreshAssistants(); const a = { ...(S.assistants.find(x => x.id === id) || { name: '', desc: '', model: '', instructions: '', style: 'Claro y detallado', creativity: 40, useDocs: false }) };
  const v = h('div', { class: 'view' }); const f = (label, el) => h('div', { class: 'field' }, h('label', { class: 'f' }, label), el);
  const name = h('input', { type: 'text', value: a.name, oninput: e => a.name = e.target.value }); const desc = h('textarea', { rows: 2, oninput: e => a.desc = e.target.value }, a.desc);
  const model = h('select', { onchange: e => a.model = e.target.value }, h('option', { value: '' }, 'Modelo predeterminado'), chatModels().map(m => h('option', { value: m.name, selected: m.name === a.model }, shortName(m.name))));
  const ins = h('textarea', { rows: 5, oninput: e => a.instructions = e.target.value }, a.instructions);
  const style = h('select', { onchange: e => a.style = e.target.value }, ['Breve', 'Claro y detallado', 'Técnico'].map(s => h('option', { selected: s === a.style }, s)));
  const crea = h('span', { class: 'muted' }, a.creativity + '%'); const rng = h('input', { type: 'range', min: 0, max: 100, value: a.creativity, style: 'width:100%', oninput: e => { a.creativity = +e.target.value; crea.textContent = a.creativity + '%'; } });
  const docs = h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: a.useDocs, onchange: e => a.useDocs = e.target.checked }), h('i'));
  const form = h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, 'Configuración'), f('Nombre', name), f('Descripción', desc), f('Modelo', model), f('Instrucciones', ins), f('Estilo de respuesta', style),
    h('div', { class: 'field' }, h('div', { style: 'display:flex;justify-content:space-between' }, h('label', { class: 'f' }, 'Creatividad'), crea), rng, h('div', { style: 'display:flex;justify-content:space-between', class: 'dim' }, h('small', {}, 'Preciso'), h('small', {}, 'Creativo'))),
    h('div', { style: 'display:flex;justify-content:space-between;align-items:center' }, h('span', {}, 'Consultar mis documentos'), docs));
  // vista previa
  const plog = h('div', { style: 'flex:1;overflow:auto;padding:6px 2px' }); const pin = h('input', { type: 'text', placeholder: 'Prueba tu asistente…' }); let busy = false;
  const psend = async () => {
    const t = pin.value.trim(); if (!t || busy) return; const mdl = a.model || S.model; if (!mdl) return toast('Instala un modelo primero.', true); busy = true; pin.value = '';
    plog.append(h('div', { style: 'text-align:right;margin:8px 0' }, h('span', { class: 'pill', style: 'background:rgba(47,123,255,.2)' }, t))); const out = h('div', { class: 'md', style: 'margin:8px 0' }); plog.append(out);
    const sid = uid(); let acc = ''; const sys = [a.instructions, a.style === 'Breve' ? 'Responde de forma breve.' : ''].filter(Boolean).join('\n');
    const off = window.api.on('chat:chunk', d => { if (d.id !== sid) return; if (d.content) { acc += d.content; out.innerHTML = md(acc); plog.scrollTop = plog.scrollHeight; } if (d.error) out.innerHTML = `<div class="err">${esc(d.error)}</div>`; if (d.done || d.error) { off(); busy = false; } });
    invoke('chat:send', sid, { model: mdl, messages: [...(sys ? [{ role: 'system', content: sys }] : []), { role: 'user', content: t }], think: false, options: { temperature: a.creativity / 100 * 1.2, num_ctx: S.cfg.numCtx || 8192 } });
  };
  pin.addEventListener('keydown', e => e.key === 'Enter' && psend());
  const prev = h('div', { class: 'card', style: 'display:flex;flex-direction:column;min-height:420px' }, h('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px' }, h('h3', { style: 'margin:0' }, 'Vista previa'), h('span', { class: 'pill' }, h('span', { html: icon('user') }), a.name || 'Nuevo asistente')), plog, h('div', { style: 'display:flex;gap:8px' }, pin, h('button', { class: 'sendb', onclick: psend, html: icon('send') })));
  const save = async () => { if (!a.name.trim()) return toast('Ponle un nombre al asistente.', true); await invoke('assistants:save', a); await refreshAssistants(); toast('Asistente guardado'); go('assistants'); };
  v.append(head(id ? 'Editar asistente' : 'Nuevo asistente', 'Personaliza cómo responde tu IA.', id && !a.builtin ? h('button', { class: 'btn danger', onclick: async () => { if (await confirmBox('Eliminar asistente', `Se eliminará "${a.name}".`, 'Eliminar', true)) { await invoke('assistants:delete', id); await refreshAssistants(); go('assistants'); } } }, 'Eliminar') : null,
    h('button', { class: 'btn', onclick: () => go('assistants') }, 'Cancelar'), h('button', { class: 'btn pri', onclick: save }, 'Guardar cambios')), h('div', { class: 'two' }, form, prev)); main.append(v);
};

// ---------- ajustes ----------
VIEWS.settings = async (main, tab = 'general') => {
  const v = h('div', { class: 'view' }); S.sys = await invoke('sys:info'); S.modelsDir = await invoke('models:dir');
  const set = async (p, redraw) => { S.cfg = await invoke('cfg:set', p); applyAppearance(); if (redraw) go('settings', tab); };
  const row = (ic, t, d, ...ctrl) => h('div', { class: 'card setrow' }, h('div', { class: 'l' }, h('span', { class: 'ic', html: icon(ic) }), h('div', {}, h('b', {}, t), h('span', {}, d))), h('div', { class: 'r' }, ...ctrl));
  const line = (label, ctrl, sub) => h('div', { class: 'line' }, h('div', {}, h('div', {}, label), sub ? h('small', { class: 'muted' }, sub) : null), ctrl);
  const sw = (k, on) => h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: on, onchange: e => set({ [k]: e.target.checked }) }), h('i'));
  const segm = (opts, cur, fn) => h('div', { class: 'seg' }, opts.map(([k, l]) => h('button', { class: cur === k ? 'on' : '', onclick: () => fn(k) }, l)));
  const body = h('div', {});
  const T = {
    general: () => [
      row('chat', 'Idioma', 'Idioma de la aplicación.', line('Idioma', h('select', { style: 'width:220px' }, h('option', {}, 'Español')))),
      row('chat', 'Conversaciones', 'Gestiona tus chats y el modelo predeterminado.', line('Guardar historial', sw('saveHistory', S.cfg.saveHistory), 'Conserva tus chats en este equipo.'),
        line('Modelo predeterminado', h('select', { style: 'width:260px', onchange: e => set({ defaultModel: e.target.value }) }, h('option', { value: '' }, 'Automático'), chatModels().map(m => h('option', { value: m.name, selected: S.cfg.defaultModel === m.name }, shortName(m.name)))))),
      row('gear', 'Conexión', 'Actualizaciones de los modelos.', line('Buscar actualizaciones automáticamente', sw('autoCheck', S.cfg.autoCheck), 'Puedes buscarlas cuando tengas internet.'),
        h('div', { style: 'display:flex;align-items:center;gap:12px' }, h('button', { class: 'btn', onclick: updateModels }, h('span', { html: icon('refresh') }), 'Buscar actualizaciones'), h('span', { class: 'muted' }, S.online ? 'Con conexión' : 'Sin conexión'))) ],
    apariencia: () => [
      row('gear', 'Tema', 'Claro, oscuro o el del sistema.', line('Tema', segm([['light', 'Claro'], ['dark', 'Oscuro'], ['system', 'Sistema']], S.cfg.theme, k => set({ theme: k }, true)))),
      row('gear', 'Tamaño del texto', 'Hazlo más cómodo de leer.', line('Tamaño', segm([['small', 'Pequeño'], ['normal', 'Normal'], ['large', 'Grande']], S.cfg.textSize, k => set({ textSize: k }, true)))) ],
    datos: () => [
      row('disk', 'Almacenamiento', 'Elige dónde se guardan tus datos y haz copias de seguridad.',
        line('Carpeta de datos', h('div', { style: 'display:flex;gap:8px;align-items:center' }, h('span', { class: 'pill sel', style: 'max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, S.cfg.dataDir), h('button', { class: 'btn', onclick: async () => { const d = await invoke('cfg:pickFolder'); if (d && await confirmBox('Mover datos', `Se copiarán tus chats y documentos a:\n${d}`, 'Mover')) { await moveDataTo(d); go('settings', tab); } } }, 'Cambiar carpeta'))),
        line('Carpeta de modelos', h('div', { style: 'display:flex;gap:8px;align-items:center' }, h('span', { class: 'pill sel', style: 'max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, S.modelsDir || '…'), h('button', { class: 'btn', onclick: async () => { const d = await invoke('cfg:pickFolder'); if (d && await confirmBox('Mover modelos', `Se copiarán los modelos de IA a:\n${d}\n\nPuede tardar varios minutos.`, 'Mover')) { await moveModelsTo(d); go('settings', tab); } } }, 'Cambiar carpeta')), 'Aquí viven los modelos descargados (los archivos grandes).'),
        h('div', { style: 'display:flex;gap:10px' }, h('button', { class: 'btn', onclick: async () => { const d = await invoke('backup:export'); d && toast('Copia guardada en ' + d); } }, h('span', { html: icon('upload') }), 'Exportar copia de seguridad'),
          h('button', { class: 'btn', onclick: async () => { const d = await invoke('backup:import'); if (d) { toast('Copia importada'); await Promise.all([refreshChats(), refreshDocs(), refreshAssistants()]); renderSide(); } } }, h('span', { html: icon('download') }), 'Importar copia'),
          h('button', { class: 'btn', onclick: () => invoke('app:openData') }, 'Abrir carpeta'))),
      row('trash', 'Borrar historial', 'Elimina todas las conversaciones.', h('div', {}, h('button', { class: 'btn danger', onclick: async () => { if (await confirmBox('Borrar historial', 'Se eliminarán todas tus conversaciones.', 'Borrar', true)) { await invoke('chats:clear'); await refreshChats(); renderSide(); toast('Historial borrado'); } } }, 'Borrar historial'))) ],
    privacidad: () => [
      row('lock', 'Todo queda en tu equipo⁠​‌​​​​‌‌​‌​‌​​​​​‌​​​​‌​​​‌​‌‌​‌​​‌‌​‌​‌​​‌‌​​​‌​​‌‌​​‌‌​‌‌​​​‌​​​‌‌​​​‌​​‌‌​​‌‌​‌‌​​​‌‌​​‌‌​​‌​⁠', 'CapiChad no envía tus chats ni documentos a ningún servidor.', h('div', { class: 'muted' }, 'Los modelos se ejecutan en tu computadora. Solo se usa internet cuando tú descargas o actualizas un modelo.'), line('Guardar historial', sw('saveHistory', S.cfg.saveHistory))) ],
    avanzado: () => [
      row('cpu', 'Rendimiento', 'Ajustes que afectan la memoria y la velocidad.', line('Contexto (tokens)', h('select', { style: 'width:160px', onchange: e => set({ numCtx: +e.target.value }) }, [2048, 4096, 8192, 16384, 32768].map(n => h('option', { value: n, selected: S.cfg.numCtx === n }, n))), 'Más contexto = recuerda más, usa más memoria.'),
        line('Mostrar el razonamiento de la IA', sw('think', S.cfg.think), 'Apagado: solo ves la respuesta. Encendido: también ves cómo piensa el modelo (si lo tiene).'),
        line('Delegar entre modelos', sw('delegation', S.cfg.delegation !== false), 'Cada modelo conoce las herramientas del sistema y puede pasar la tarea a otro (programación, documentos, imágenes).')),
      row('file', 'Búsqueda en documentos', 'Modelo para buscar por significado.', line('Modelo de embeddings', h('input', { type: 'text', style: 'width:240px', value: S.cfg.embedModel, onchange: e => set({ embedModel: e.target.value.trim() || 'nomic-embed-text' }) }))),
      row('cpu', 'Servidor de Ollama', 'Avanzado: usa un Ollama de otro equipo de tu red (por ejemplo, un PC más potente).',
        line('Dirección', h('input', { type: 'text', style: 'width:260px', placeholder: '127.0.0.1:11434 (este equipo)', value: S.cfg.ollamaHost || '',
          onchange: async e => { S.cfg = await invoke('cfg:set', { ollamaHost: e.target.value.trim() }); toast(e.target.value.trim() ? 'Se usará el servidor ' + e.target.value.trim() + '. Reinicia la app si algo no responde.' : 'Se usará Ollama en este equipo.'); } }),
          'Déjalo vacío para usar el Ollama de este equipo. Debe aceptar conexiones de la red (OLLAMA_HOST=0.0.0.0).')),
      row('info', 'Acerca de', 'CapiChad · Capibara Software · AGPL-3.0-or-later', h('div', { class: 'muted' },
        `Versión ${S.sys.version} · ${S.sys.cpu}${S.sys.platform ? ' · ' + S.sys.platform.arch + ' ' + S.sys.platform.osBits + ' bits' : ''}`),
        h('div', { class: 'muted', style: 'margin-top:4px' }, 'Creado por Capibara Software (OrtegaGhost), 2026. Código abierto bajo AGPL-3.0: si lo redistribuyes o lo ofreces como servicio, debes conservar estos avisos de autoría y publicar tu código fuente.')) ]
  };
  async function updateModels() {
    if (!(await invoke('net:check'))) { S.online = false; toast('Sin conexión a internet.', true); return; }
    toast('Buscando actualizaciones de tus modelos…'); let n = 0; for (const m of visibleModels()) { try { await invoke('models:pull', m.name); n++; } catch (e) { logl(`Actualización de ${m.name} falló: ${e.message}`); } } await refreshModels(); toast(`Modelos revisados: ${n}`);
  }
  const draw = () => { body.innerHTML = ''; T[tab]().forEach(r => body.append(r)); };
  v.append(head('Ajustes', 'Adapta la aplicación a tu forma de trabajar.'), tabs([['general', 'General', 'gear'], ['apariencia', 'Apariencia'], ['datos', 'Datos', 'disk'], ['privacidad', 'Privacidad', 'lock'], ['avanzado', 'Avanzado']], tab, k => go('settings', k)), body,
    h('div', { class: 'banner' }, h('span', { class: 'ic', html: icon('lock') }), h('div', { class: 't' }, 'Chats, archivos y ajustes guardados en este equipo.')));
  main.append(v); draw();
};
