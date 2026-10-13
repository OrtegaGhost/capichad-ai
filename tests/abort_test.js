// CapiChad - (c) 2026 Capibara Software (OrtegaGhost) - AGPL-3.0-or-later - https://github.com/OrtegaGhost/capichad-ai
// Aviso de autoria: conserva este encabezado y el archivo NOTICE en copias y derivados.
﻿const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert'); const P=require('../prog.js');
const PY = process.env.CAPICHAD_TEST_PY || require('path').join(__dirname, '..', 'tools', 'python', 'python.exe');
(async()=>{
  // 1) abortar mientras el modelo "escribe"
  let d=fs.mkdtempSync(path.join(os.tmpdir(),'ab-')); let ac=new AbortController();
  const chat=({signal})=>new Promise((res,rej)=>{ signal.addEventListener('abort',()=>{const e=new Error('abort');e.name='AbortError';rej(e);}); });
  setTimeout(()=>ac.abort(),300);
  let r=await P.runProgram({folder:d,task:'x',model:'m',chat,py:PY,signal:ac.signal});
  assert(r.aborted===true && /Detenido/.test(r.summary),'abortado: '+r.summary);
  // 2) abortar durante la verificacion (comando largo)
  d=fs.mkdtempSync(path.join(os.tmpdir(),'ab2-')); ac=new AbortController();
  const t0=Date.now(); setTimeout(()=>ac.abort(),1500);
  r=await P.runProgram({folder:d,task:'x',model:'m',py:PY,signal:ac.signal,verifyCmd:'ping -n 30 127.0.0.1',chat:async()=>({text:'=== ARCHIVO: a.txt ===\nhola\n=== FIN ==='})});
  assert(r.aborted && (Date.now()-t0)<15000,'abort corta la verificacion en '+(Date.now()-t0)+' ms');
  // 3) timeout de verificacion
  d=fs.mkdtempSync(path.join(os.tmpdir(),'to-'));
  r=await P.runProgram({folder:d,task:'x',model:'m',py:PY,maxIter:1,verifyMs:1500,verifyCmd:'ping -n 30 127.0.0.1',chat:async()=>({text:'=== ARCHIVO: a.txt ===\nhola\n=== FIN ==='})});
  assert(r.ok===false && r.verify.timedOut===true,'timeout detectado');
  console.log('OK abort/timeout');
})().catch(e=>{console.error('FALLO',e.message);process.exit(1)});
