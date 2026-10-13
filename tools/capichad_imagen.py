#!/usr/bin/env python3
# CapiChad - (c) 2026 Capibara Software (OrtegaGhost) - AGPL-3.0-or-later - https://github.com/OrtegaGhost/capichad-ai
# Aviso de autoria: conserva este encabezado y el archivo NOTICE en copias y derivados.
"""CapiChad Imagen: genera imagenes con el motor local (Stable Diffusion 1.5 LCM, GPU).

Usa el motor de %LOCALAPPDATA%\\CapiChad\\imagegen (se instala con instalar_motor_imagenes.py); si no existe,
reutiliza el de ReelStoryMaker. Se puede forzar otra carpeta con la variable CAPICHAD_IMAGEGEN.
Solo biblioteca estandar; el motor corre como subproceso en su propio entorno.

CLI:
  python capichad_imagen.py "un gato astronauta" -o salida.jpg [--width 512 --height 512]
         [--seed 7 --steps 4 --ref foto.png --strength 0.6 --traducir]
Salida (stdout): una linea JSON {"ok": true, "files": [...], "seconds": 14.2}

Como modulo:  from capichad_imagen import generar
"""
import argparse
import http.client
import json
import os
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

AQUI = Path(__file__).resolve().parent
def _resolver_motor() -> Path:
    """CAPICHAD_IMAGEGEN, o el motor propio de CapiChad, o (si existe) el de ReelStoryMaker."""
    env = os.environ.get("CAPICHAD_IMAGEGEN")
    if env:
        return Path(env)
    base = Path(os.environ.get("LOCALAPPDATA", ""))
    for cand in (base / "CapiChad" / "imagegen", base / "ReelStoryMaker" / "imagegen"):
        if (cand / "venv" / "Scripts" / "python.exe").exists():
            return cand
    return base / "CapiChad" / "imagegen"


MOTOR = _resolver_motor()
PYTHON = MOTOR / "venv" / "Scripts" / "python.exe"
MODELO = MOTOR / "models" / "dreamshaper-8-lcm-fp16"
SCRIPT = AQUI / "imagegen" / "generate_images.py"
OLLAMA = ("127.0.0.1", 11434)
_candado = threading.Lock()  # la GPU de 4 GB solo admite un trabajo a la vez


def _ollama(metodo, ruta, cuerpo=None, timeout=120):
    c = http.client.HTTPConnection(*OLLAMA, timeout=timeout)
    c.request(metodo, ruta, json.dumps(cuerpo) if cuerpo is not None else None,
              {"Content-Type": "application/json"} if cuerpo is not None else {})
    try:
        return json.loads(c.getresponse().read() or b"{}")
    finally:
        c.close()


def liberar_gpu():
    """Descarga de memoria los modelos de lenguaje: la GPU no cabe para ambos."""
    try:
        for m in _ollama("GET", "/api/ps", timeout=5).get("models", []):
            _ollama("POST", "/api/generate", {"model": m["name"], "keep_alive": 0}, timeout=60)
    except Exception:
        pass


def _modelo_traductor():
    """Un modelo instalado que NO razone (qwen3/gpt-oss vuelcan su razonamiento en la respuesta)."""
    try:
        tags = [m["name"] for m in _ollama("GET", "/api/tags", timeout=10).get("models", [])]
    except Exception:
        return None
    cand = [n for n in tags if not any(k in n.lower() for k in ("embed", "-cl:", "vl", "coder", "gpt-oss", "qwen3"))]
    cand.sort(key=lambda n: (0 if "gemma" in n.lower() else 1, n))
    for n in cand:
        try:
            caps = _ollama("POST", "/api/show", {"model": n}, timeout=15).get("capabilities", [])
            if "thinking" not in caps and "completion" in caps:
                return n
        except Exception:
            continue
    return None


def traducir_a_ingles(texto, modelo=None):
    """Traduce el prompt con un modelo local que no razone; si no hay o falla, devuelve el original."""
    modelo = modelo or _modelo_traductor()
    if not modelo:
        return texto
    try:
        r = _ollama("POST", "/api/chat", {
            "model": modelo, "stream": False, "keep_alive": 0,
            "messages": [{"role": "user", "content":
                          "Translate this image description to English for an image generator. "
                          "Keep art styles and materials exact (acuarela = watercolor, óleo = oil painting, "
                          "acrílico = acrylic, lápiz = pencil drawing, boceto = sketch, caricatura = cartoon, "
                          "pixel art = pixel art, realista = photorealistic). "
                          "Reply with only the translation, one line, no quotes:\n" + texto}],
            "options": {"temperature": 0.2, "num_predict": 120},
        }, timeout=180)
        t = (r.get("message", {}).get("content") or "").strip().splitlines()
        res = t[0].strip().strip('"\'') if t and t[0].strip() else ""
        if not res or res.lower().startswith(("okay", "ok,", "let's", "let me", "the user", "hmm", "here is", "here's", "sure")):
            return texto                       # parece razonamiento o relleno, no una traduccion
        return res
    except Exception:
        return texto


def disponible():
    faltan = [str(p) for p in (PYTHON, MODELO, SCRIPT) if not p.exists()]
    return (not faltan), faltan


def generar(prompts, salidas, width=512, height=512, seed=None, steps=4, ref=None, strength=0.6,
            traducir=False, timeout=900):
    """Genera len(prompts) imagenes. Devuelve dict {ok, files, seconds, errors}."""
    ok, faltan = disponible()
    if not ok:
        return {"ok": False, "files": [], "seconds": 0, "errors": ["motor no instalado: " + ", ".join(faltan)]}
    width, height = max(256, int(width) // 8 * 8), max(256, int(height) // 8 * 8)
    if width * height > 768 * 768:
        return {"ok": False, "files": [], "seconds": 0,
                "errors": ["tamano demasiado grande para 4 GB de VRAM (maximo ~768x768)"]}
    with _candado:
        t0 = time.time()
        liberar_gpu()
        base = int(time.time()) % 100000 if seed is None else int(seed)
        jobs = []
        for i, (p, o) in enumerate(zip(prompts, salidas)):
            job = {"prompt": traducir_a_ingles(p) if traducir else p, "negative_prompt": "",
                   "width": width, "height": height, "seed": base + i, "out": str(Path(o).resolve())}
            if ref:
                job["init_image"] = str(Path(ref).resolve())
                job["strength"] = float(strength)
            jobs.append(job)
        if traducir:
            liberar_gpu()
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f:
            json.dump(jobs, f)
            ruta_jobs = f.name
        errores, hechos = [], []
        try:
            p = subprocess.Popen([str(PYTHON), str(SCRIPT), "--model-dir", str(MODELO), "--jobs", ruta_jobs,
                                  "--steps", str(int(steps))], stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                 text=True, encoding="utf-8", errors="replace")
            fin = time.time() + timeout
            for linea in p.stdout:
                partes = linea.split()
                if partes[:1] == ["DONE"]:
                    hechos.append(jobs[int(partes[1])]["out"])
                elif partes[:1] == ["FAIL"]:
                    errores.append(linea.strip())
                elif partes[:1] == ["ERROR"]:
                    errores.append(linea.strip())
                if time.time() > fin:
                    p.kill()
                    errores.append("tiempo agotado")
                    break
            p.wait(timeout=30)
            if p.returncode not in (0, None) and not hechos:
                errores.append(f"el motor termino con codigo {p.returncode}")
        finally:
            try:
                os.unlink(ruta_jobs)
            except OSError:
                pass
        return {"ok": bool(hechos) and not errores, "files": hechos, "seconds": round(time.time() - t0, 1),
                "errors": errores, "prompts": [j["prompt"] for j in jobs]}


def main():
    ap = argparse.ArgumentParser(description="Genera imagenes con el motor local de CapiChad")
    ap.add_argument("prompt", nargs="+", help="descripcion(es) de la imagen; una por argumento")
    ap.add_argument("-o", "--out", required=True, help="archivo de salida (.jpg); con varios prompts, una carpeta")
    ap.add_argument("--width", type=int, default=512)
    ap.add_argument("--height", type=int, default=512)
    ap.add_argument("--seed", type=int)
    ap.add_argument("--steps", type=int, default=4)
    ap.add_argument("--ref", help="imagen de referencia (img2img)")
    ap.add_argument("--strength", type=float, default=0.6, help="0.2-0.95: cuanto se aleja de la referencia")
    ap.add_argument("--traducir", action="store_true", help="traduce el prompt al ingles con el modelo local")
    a = ap.parse_args()
    if len(a.prompt) == 1:
        salidas = [a.out]
    else:
        Path(a.out).mkdir(parents=True, exist_ok=True)
        salidas = [str(Path(a.out) / f"imagen_{i + 1:02d}.jpg") for i in range(len(a.prompt))]
    r = generar(a.prompt, salidas, a.width, a.height, a.seed, a.steps, a.ref, a.strength, a.traducir)
    print(json.dumps(r, ensure_ascii=False))
    return 0 if r["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
