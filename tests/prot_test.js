// CapiChad - (c) 2026 Capibara Software (OrtegaGhost) - AGPL-3.0-or-later - https://github.com/OrtegaGhost/capichad-ai
// Aviso de autoria: conserva este encabezado y el archivo NOTICE en copias y derivados.
﻿const fs=require('fs'),path=require('path'),os=require('os'); const P=require('../prog.js');
const PY=process.env.LOCALAPPDATA+'\\Programs\\CapiChad\\resources\\tools\\python\\python.exe';
const d=fs.mkdtempSync(path.join(os.tmpdir(),'prot-')); fs.writeFileSync(path.join(d,'test_a.py'),'import unittest\nfrom a import f\nclass T(unittest.TestCase):\n    def test(self): self.assertEqual(f(),2)\n');
fs.writeFileSync(path.join(d,'a.py'),'def f():\n    return 1\n');
let n=0; const chat=async()=>{ n++; return {text: n===1 ? '=== ARCHIVO: test_a.py ===\nimport unittest\nclass T(unittest.TestCase):\n    def test(self): pass\n=== FIN ===' : '=== ARCHIVO: a.py ===\ndef f():\n    return 2\n=== FIN ==='}; };
P.runProgram({folder:d,task:'Corrige a.py para que pasen los tests, sin modificar los tests.',model:'x',chat,py:PY}).then(r=>{
  const t=fs.readFileSync(path.join(d,'test_a.py'),'utf8');
  console.log(JSON.stringify({ok:r.ok,intentos:r.iterations.length,notas:r.notes,testIntacto:/assertEqual\(f\(\),2\)/.test(t)}));
});
