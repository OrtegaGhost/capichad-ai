// CapiChad - (c) 2026 Capibara Software (OrtegaGhost) - AGPL-3.0-or-later - https://github.com/OrtegaGhost/capichad-ai
// Aviso de autoria: conserva este encabezado y el archivo NOTICE en copias y derivados.
﻿const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert'); const P=require('../prog.js');
const ev=[];const d=fs.mkdtempSync(path.join(os.tmpdir(),'web-')); let n=0, imgs=0;
const chat=async()=>{ n++; return {text: n===1 ? '=== ARCHIVO: index.html ===\n<html><body style="background:url(assets/fondo.jpg)"><img src="logo.png"><a href="https://x.com">x</a></body></html>\n=== FIN ===' : '=== IMAGEN: assets/fondo.jpg 512x512 ===\na lake\n=== FIN ===\n=== ARCHIVO: logo.png.txt ===\nx\n=== FIN ===\n=== ARCHIVO: index.html ===\n<html><body style="background:url(assets/fondo.jpg)"><a href="https://x.com">x</a></body></html>\n=== FIN ==='}; };
P.runProgram({folder:d,task:'pagina con fondo',model:'x',chat,py:'python',emit:e=>ev.push(e),makeImage:async({dest})=>{imgs++;fs.writeFileSync(dest,'jpg');return {ok:true};}}).then(r=>{
  assert(r.ok===true && r.level==='referencias','nivel referencias: '+r.level+' '+r.summary);
  assert(r.iterations.length===2 && r.iterations[0].verify.code===1,'primer intento detecta referencias rotas');
  assert(/logo\.png|fondo\.jpg/.test(ev.find(e=>e.t==='verify').out),'salida menciona faltantes');
  assert(imgs===1 && fs.existsSync(path.join(d,'assets','fondo.jpg')),'imagen generada');
  assert(/NO se ha ejecutado/.test(r.summary),'honesto: '+r.summary);
  console.log('OK referencias: '+JSON.stringify({it:r.iterations.length,sum:r.summary.slice(0,60)}));
}).catch(e=>{console.error('FALLO',e.message);process.exit(1)});

