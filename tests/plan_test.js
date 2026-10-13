// CapiChad - (c) 2026 Capibara Software (OrtegaGhost) - AGPL-3.0-or-later - https://github.com/OrtegaGhost/capichad-ai
// Aviso de autoria: conserva este encabezado y el archivo NOTICE en copias y derivados.
'use strict';
const assert = require('assert');
const { recommend, totals } = require('../plan.js');
const lib = require('../catalog/biblioteca.json');
let n = 0; const ok = (c, m) => { n++; assert(c, m); };
const sel = r => r.items.filter(i => i.selected).map(i => i.id);
const lvl = (r, id) => r.items.find(i => i.id === id).level;
const base = { python: true, installed: { models: [], packs: [] } };

// A) portátil modesto: 8 GB de RAM, sin GPU NVIDIA, 120 GB libres, SSD
let r = recommend({ ...base, ramTotalGB: 7.8, diskFreeGB: 120, diskMedia: 'SSD', gpu: null }, lib);
ok(lvl(r, 'm_fast') === 'ok' && sel(r).includes('m_fast'), 'A: modelo rápido recomendado');
ok(lvl(r, 'm_code') === 'no' && !sel(r).includes('m_code'), 'A: gpt-oss no alcanza con 8 GB');
ok(lvl(r, 'm_coder30') === 'no' && lvl(r, 'e_images') === 'no', 'A: 30B e imágenes (sin NVIDIA) = no');
ok(lvl(r, 'm_vision') === 'warn' && !sel(r).includes('m_vision'), 'A: visión justa, no preseleccionada');
ok(sel(r).includes('p_dev_core') && sel(r).includes('p_wiki_es'), 'A: bibliotecas esenciales preseleccionadas');
ok(!sel(r).includes('p_wiki_en') && !sel(r).includes('p_so_full'), 'A: Wikipedia EN y Stack Overflow no preseleccionados');
let t = totals(r, sel(r), 120); ok(t.fits && t.freeAfterGB >= 25, 'A: la selección cabe dejando reserva');
ok(r.notes.some(x => /gráfica compatible|procesador/.test(x)), 'A: avisa de que no hay GPU compatible');
ok(lvl(r, 'e_images') === 'no', 'A: con 8 GB de RAM tampoco hay imágenes por CPU');

// B) el equipo de referencia: 24 GB, GTX 1650 4 GB, 500 GB libres
r = recommend({ ...base, ramTotalGB: 23.8, diskFreeGB: 500, diskMedia: 'SSD', gpu: { name: 'GTX 1650', vramGB: 4 } }, lib);
ok(lvl(r, 'm_code') === 'ok' && sel(r).includes('m_code'), 'B: gpt-oss recomendado con 24 GB');
ok(lvl(r, 'm_coder30') === 'warn' && !sel(r).includes('m_coder30'), 'B: 30B solo con aviso, nunca preseleccionado');
ok(lvl(r, 'e_images') === 'ok' && sel(r).includes('e_images'), 'B: imágenes recomendadas con NVIDIA de 4 GB');
ok(sel(r).filter(x => x.startsWith('p_')).length >= 5, 'B: varias bibliotecas preseleccionadas');
ok(!sel(r).includes('p_so_full'), 'B: Stack Overflow completo nunca se preselecciona');
t = totals(r, sel(r), 500); ok(t.fits && t.downloadGB < 200, 'B: total razonable (' + t.downloadGB.toFixed(0) + ' GB)');

// C) 16 GB de RAM, RTX 3060 de 12 GB, solo 60 GB libres: el disco manda
r = recommend({ ...base, ramTotalGB: 16, diskFreeGB: 60, diskMedia: 'SSD', gpu: { name: 'RTX 3060', vramGB: 12 } }, lib);
ok(lvl(r, 'm_code') === 'warn', 'C: gpt-oss con 16 GB = aviso');
t = totals(r, sel(r), 60); ok(t.fits, 'C: la preselección respeta la reserva de 25 GB (libre tras instalar: ' + t.freeAfterGB.toFixed(1) + ')');
ok(lvl(r, 'p_wiki_en') === 'no', 'C: Wikipedia EN (52 GB) no cabe en 60 GB');
t = totals(r, ['p_wiki_en'], 60); ok(!t.fits && t.nos.includes('p_wiki_en'), 'C: forzar un paquete que no cabe se reporta');

// D) equipo muy limitado: 4 GB de RAM
r = recommend({ ...base, ramTotalGB: 4, diskFreeGB: 80, diskMedia: 'HDD', gpu: null }, lib);
ok(lvl(r, 'm_fast') === 'no', 'D: ni el modelo pequeño es recomendable con 4 GB');
ok(r.notes.some(x => /poca memoria/.test(x)) && r.notes.some(x => /HDD/.test(x)), 'D: avisos de RAM y de HDD');

// E) HDD: paquetes grandes con aviso
r = recommend({ ...base, ramTotalGB: 16, diskFreeGB: 400, diskMedia: 'HDD', gpu: null }, lib);
ok(lvl(r, 'p_wiki_en') === 'warn' && lvl(r, 'p_dev_qa') === 'warn', 'E: en HDD los paquetes de >20 GB llevan aviso');

// F) lo ya instalado no se vuelve a preseleccionar
r = recommend({ ...base, ramTotalGB: 24, diskFreeGB: 300, diskMedia: 'SSD', gpu: null, installed: { models: ['qwen3:4b-instruct-2507-q4_K_M', 'nomic-embed-text:latest'], packs: ['dev_core'] } }, lib);
ok(!sel(r).includes('m_fast') && !sel(r).includes('p_dev_core') && r.items.find(i => i.id === 'm_fast').installed, 'F: lo instalado se marca y no se repite');

// G) AMD completo: Ryzen + Radeon RX discreta de 12 GB, 16 GB de RAM -> sin CUDA: imágenes por CPU con aviso
const ryzen = { vendor: 'AMD', name: 'AMD Ryzen 5 5600X', cores: 12, avx: true, avx2: true };
r = recommend({ ...base, ramTotalGB: 16, diskFreeGB: 300, diskMedia: 'SSD', gpu: null, cpu: ryzen, osBits: 64, arch: 'x64',
  gpus: [{ name: 'AMD Radeon RX 6700 XT', vendor: 'AMD', vramGB: 12, integrated: false }] }, lib);
ok(lvl(r, 'm_fast') === 'ok' && sel(r).includes('m_fast'), 'G: AMD: el modelo rápido se recomienda igual');
ok(lvl(r, 'e_images') === 'warn' && !sel(r).includes('e_images'), 'G: AMD sin CUDA: imágenes con aviso (CPU) y sin preseleccionar');
ok(r.items.find(i => i.id === 'e_images').reason.some(x => /AMD/.test(x) && /procesador/.test(x)), 'G: el aviso nombra a AMD y al procesador');
ok(r.items.find(i => i.id === 'e_images').bytes < 6 * 1024 ** 3, 'G: la descarga del motor por CPU es menor (sin CUDA)');
ok(r.notes.some(x => /AMD/.test(x) && /ROCm/.test(x)), 'G: nota sobre aceleración AMD (ROCm) con respaldo en CPU');

// H) portátil Intel con gráfica integrada, 16 GB
r = recommend({ ...base, ramTotalGB: 15.8, diskFreeGB: 200, diskMedia: 'SSD', gpu: null, osBits: 64, arch: 'x64',
  cpu: { vendor: 'Intel', name: 'Intel(R) Core(TM) i7-1165G7', cores: 8, avx: true, avx2: true },
  gpus: [{ name: 'Intel(R) Iris(R) Xe Graphics', vendor: 'Intel', vramGB: 0, integrated: true }] }, lib);
ok(r.notes.some(x => /Intel/.test(x) && /procesador/.test(x)), 'H: Intel integrada: los modelos van en el procesador');
ok(lvl(r, 'e_images') === 'warn', 'H: imágenes por CPU con aviso');

// I) CPU antiguo sin AVX2 -> aviso; sin AVX -> no
r = recommend({ ...base, ramTotalGB: 16, diskFreeGB: 200, gpu: null, osBits: 64, arch: 'x64', cpu: { vendor: 'Intel', name: 'Core 2 Quad', cores: 4, avx: true, avx2: false } }, lib);
ok(lvl(r, 'm_fast') === 'warn' && r.items.find(i => i.id === 'm_fast').reason.some(x => /AVX2/.test(x)), 'I: sin AVX2 = aviso de lentitud');
r = recommend({ ...base, ramTotalGB: 16, diskFreeGB: 200, gpu: null, osBits: 64, arch: 'x64', cpu: { vendor: 'AMD', name: 'Athlon 64', cores: 2, avx: false, avx2: false } }, lib);
ok(lvl(r, 'm_fast') === 'no', 'I: sin AVX los modelos no arrancan');

// J) 32 bits: ningún modelo local; K) ARM: aviso; L) Ollama remoto: los modelos no se juzgan por la RAM local
r = recommend({ ...base, ramTotalGB: 3, diskFreeGB: 80, gpu: null, osBits: 32, arch: 'x86' }, lib);
ok(['m_fast', 'm_code', 'e_images'].every(id => lvl(r, id) === 'no') && r.notes.some(x => /32 bits/.test(x)), 'J: 32 bits = nada local, con explicación');
r = recommend({ ...base, ramTotalGB: 16, diskFreeGB: 100, gpu: null, osBits: 64, arch: 'arm64' }, lib);
ok(lvl(r, 'm_fast') === 'warn' && r.notes.some(x => /ARM/.test(x)), 'K: ARM64 = aviso de no probado');
r = recommend({ ...base, ramTotalGB: 4, diskFreeGB: 100, gpu: null, osBits: 64, arch: 'x64', remote: true }, lib);
ok(lvl(r, 'm_code') === 'ok', 'L: con Ollama remoto no se juzga por la RAM local');

console.log(`OK plan: ${n} comprobaciones`);
