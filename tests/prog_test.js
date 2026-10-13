// CapiChad - (c) 2026 Capibara Software (OrtegaGhost) - AGPL-3.0-or-later - https://github.com/OrtegaGhost/capichad-ai
// Aviso de autoria: conserva este encabezado y el archivo NOTICE en copias y derivados.
﻿const assert = require('assert'); const fs = require('fs'); const path = require('path'); const os = require('os');
const P = require('../prog.js');
const PY = process.env.CAPICHAD_TEST_PY || require('path').join(__dirname, '..', 'tools', 'python', 'python.exe');
let n = 0; const ok = (c, m) => { n++; assert(c, m); };

// 1. parseResponse
let r = P.parseResponse('PLAN: hacer fizzbuzz\n=== ARCHIVO: fizz.py ===\n```python\ndef f(): pass\n```\n=== FIN ===\n=== ARCHIVO: t/test_f.py ===\nimport unittest\n=== FIN ===\nVERIFICAR: python -m unittest');
ok(r.files.length === 2 && r.files[0].content === 'def f(): pass\n', 'fence interna eliminada'); ok(r.plan === 'hacer fizzbuzz', 'plan'); ok(r.verify === 'python -m unittest', 'verify');
r = P.parseResponse('=== ARCHIVO: a.py ===\nprint(1)\n');           ok(r.files[0].truncated && r.truncated, 'truncado sin FIN');
r = P.parseResponse('Aqui va:\n**fizzbuzz.py**\n```python\nprint("x")\n```\n'); ok(r.files.length === 1 && r.files[0].path === 'fizzbuzz.py' && r.format === 'fences', 'respaldo por fences');
r = P.parseResponse('=== IMAGEN: assets/hero.jpg 768x512 ===\na red car\n=== FIN ==='); ok(r.images[0].w === 768 && r.images[0].path === 'assets/hero.jpg', 'imagen');
r = P.parseResponse('<think>x</think>nada util'); ok(!r.files.length, 'sin archivos');

// 2. safePath
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prog-'));
for (const bad of ['../x.py', 'C:/Windows/a.py', '/etc/a', 'a/../../b.py', '.git/config', 'node_modules/x.js', 'virus.exe', '']) { let t = false; try { P.safePath(tmp, bad); } catch { t = true; } ok(t, 'debe rechazar ' + bad); }
ok(P.safePath(tmp, './src/a.py').rel === 'src/a.py', 'ruta valida');

// 3. bucle con modelo falso: 1er intento con bug, 2o corregido
const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'prog-proj-')); fs.writeFileSync(path.join(proj, 'leeme.txt'), 'hola\n');
const test = 'import unittest\nfrom fizzbuzz import fizzbuzz\nclass T(unittest.TestCase):\n    def test_a(self):\n        self.assertEqual(fizzbuzz(5), ["1","2","Fizz","4","Buzz"])\n    def test_15(self):\n        self.assertEqual(fizzbuzz(15)[-1], "FizzBuzz")\nif __name__ == "__main__":\n    unittest.main()\n';
const bug = 'def fizzbuzz(n):\n    out = []\n    for i in range(1, n+1):\n        if i % 3 == 0: out.append("Fizz")\n        elif i % 5 == 0: out.append("Buzz")\n        else: out.append(str(i))\n    return out\n';
const fixed = bug.replace('        if i % 3 == 0', '        if i % 15 == 0: out.append("FizzBuzz")\n        elif i % 3 == 0');
let calls = 0; const seen = [];
const chat = async ({ messages }) => { calls++; seen.push(messages[1].content);
  const t = calls === 1 ? `PLAN: crear funcion y pruebas\n=== ARCHIVO: fizzbuzz.py ===\n${bug}=== FIN ===\n=== ARCHIVO: test_fizzbuzz.py ===\n${test}=== FIN ===` : `PLAN: corregir multiplos de 15\n=== ARCHIVO: fizzbuzz.py ===\n${fixed}=== FIN ===`;
  return { text: t, evalCount: 100 }; };
const events = [];
(async () => {
  const rep = await P.runProgram({ folder: proj, task: 'fizzbuzz con pruebas', model: 'falso', chat, py: PY, emit: e => events.push(e.t) });
  ok(rep.ok === true && rep.level === 'pruebas', 'debe quedar verificado con pruebas: ' + JSON.stringify(rep.summary));
  ok(rep.iterations.length === 2 && rep.iterations[0].verify.code !== 0 && rep.iterations[1].verify.code === 0, 'fallo real y luego exito');
  ok(/RESULTADO REAL/.test(seen[1]) && /FizzBuzz|AssertionError/.test(seen[1]), 'el 2o prompt lleva la salida real del fallo');
  ok(fs.readFileSync(path.join(proj, 'fizzbuzz.py'), 'utf8') === fixed, 'archivo final corregido');
  ok(events.includes('iter') && events.includes('files') && events.includes('verify') && events.includes('done'), 'eventos');
  // 4. deshacer
  const runs = P.listRuns(proj); ok(runs.length === 1, 'hay una copia'); P.undoRun(proj, rep.id);
  ok(!fs.existsSync(path.join(proj, 'fizzbuzz.py')) && fs.readFileSync(path.join(proj, 'leeme.txt'), 'utf8') === 'hola\n', 'deshacer elimina lo creado y respeta lo previo');
  // 5. anti-alucinacion: el modelo "dice" que termino pero no entrega archivos
  const proj2 = fs.mkdtempSync(path.join(os.tmpdir(), 'prog-proj2-'));
  const rep2 = await P.runProgram({ folder: proj2, task: 'haz algo', model: 'falso', py: PY, maxIter: 2, chat: async () => ({ text: 'Listo, creé fizzbuzz.py y los tests pasan. ✅' }) });
  ok(rep2.ok === false && rep2.files.length === 0 && /no logró|ningún archivo/i.test(rep2.summary), 'sin archivos = no exito: ' + rep2.summary);
  // 6. solo sintaxis se declara como tal
  const proj3 = fs.mkdtempSync(path.join(os.tmpdir(), 'prog-proj3-'));
  const rep3 = await P.runProgram({ folder: proj3, task: 'script', model: 'falso', py: PY, chat: async () => ({ text: '=== ARCHIVO: a.py ===\nprint(1)\n=== FIN ===' }) });
  ok(rep3.ok && rep3.level === 'sintaxis' && /NO hay pruebas/.test(rep3.summary), 'sintaxis honesta: ' + rep3.summary);
  // 7. comando ajeno propuesto por el modelo no se ejecuta
  const proj4 = fs.mkdtempSync(path.join(os.tmpdir(), 'prog-proj4-'));
  const rep4 = await P.runProgram({ folder: proj4, task: 'x', model: 'falso', py: PY, chat: async () => ({ text: '=== ARCHIVO: b.txt ===\nhola\n=== FIN ===\nVERIFICAR: del /s /q C:\\*' }) });
  ok(rep4.verify === null || !/del /.test(JSON.stringify(rep4.verify)), 'comando peligroso ignorado');
  console.log(`OK: ${n} comprobaciones`);
})().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
