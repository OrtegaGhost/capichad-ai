# CapiChad - (c) 2026 Capibara Software (OrtegaGhost) - AGPL-3.0-or-later - https://github.com/OrtegaGhost/capichad-ai
# Aviso de autoria: conserva este encabezado y el archivo NOTICE en copias y derivados.
"""Instalador (una sola vez) del generador local de imagenes de CapiChad.

Con tarjeta NVIDIA descarga ~7 GB (PyTorch+CUDA ~2.5 GB, modelo ~4.3 GB); con AMD, Intel o sin tarjeta usa la CPU
(PyTorch CPU ~200 MB; ~4.6 GB en total). Necesita ~9 GB de disco libre durante la conversion.
Es seguro volver a ejecutarlo: los pasos ya terminados se omiten.

    python instalar_motor_imagenes.py                 # instala y hace una prueba real
    python instalar_motor_imagenes.py --skip-test     # sin la prueba final
    python instalar_motor_imagenes.py --cuda cu124    # otra version de CUDA (por defecto: auto = CUDA si hay NVIDIA, si no CPU)
    python instalar_motor_imagenes.py --cuda cpu      # forzar el modo CPU (AMD, Intel o sin tarjeta)

Requisitos: Windows de 64 bits, Python 3.10-3.13 de 64 bits (solo para crear el entorno) e internet.
Con NVIDIA (driver reciente) usa CUDA; con AMD, Intel o solo procesador usa la CPU: cada imagen tarda de 1 a 3
minutos y necesita ~6 GB de RAM libres. Todo queda en %LOCALAPPDATA%\\CapiChad\\imagegen
(o en la carpeta de la variable CAPICHAD_IMAGEGEN). No se instala nada en el sistema ni en la app.

Si Hugging Face esta bloqueado o lento, define antes HF_ENDPOINT=https://hf-mirror.com (espejo alterno).
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

AQUI = Path(__file__).resolve().parent
MOTOR = Path(os.environ.get("CAPICHAD_IMAGEGEN") or Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "CapiChad" / "imagegen")
VENV_PY = MOTOR / "venv" / "Scripts" / "python.exe"
MODELO = MOTOR / "models" / "dreamshaper-8-lcm-fp16"
SCRIPT = AQUI / "imagegen" / "generate_images.py"
DESCARGA = MOTOR / "models" / "_download"

TORCH_VERSION = "2.9.1"
PIP_PACKAGES = ["diffusers", "transformers", "accelerate", "safetensors", "huggingface_hub", "pillow", "numpy"]
MODEL_REPO = "Lykon/dreamshaper-8-lcm"      # destilado a 4 pasos (LCM), licencia OpenRAIL-M

_DESCARGAR = """
import sys
from huggingface_hub import snapshot_download
snapshot_download(
    repo_id=sys.argv[1], local_dir=sys.argv[2],
    allow_patterns=["model_index.json", "scheduler/*", "tokenizer/*", "text_encoder/*",
                    "unet/*", "vae/*", "feature_extractor/*"],
    ignore_patterns=["*.bin", "*.onnx*", "*.ckpt", "*.msgpack", "*.h5"],
)
"""

_A_FP16 = """
import sys, torch
from diffusers import StableDiffusionPipeline
pipe = StableDiffusionPipeline.from_pretrained(
    sys.argv[1], torch_dtype=torch.float16, safety_checker=None, requires_safety_checker=False)
pipe.save_pretrained(sys.argv[2], safe_serialization=True)
"""


def paso(msg: str) -> None:
    print(f"\n=== [{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def ejecutar(cmd) -> None:
    subprocess.run([str(c) for c in cmd], check=True)


def comprobar_requisitos() -> None:
    if sys.platform != "win32":
        raise SystemExit("Este instalador es para Windows.")
    if not (3, 10) <= sys.version_info[:2] <= (3, 13):
        raise SystemExit(f"Se necesita Python 3.10 a 3.13 (tienes {sys.version.split()[0]}). "
                         "Descargalo en https://www.python.org/downloads/windows/ y vuelve a ejecutar.")
    if not SCRIPT.exists():
        raise SystemExit(f"Falta {SCRIPT}. Ejecuta este archivo desde la carpeta 'tools' de CapiChad.")
    if sys.maxsize <= 2**32:
        raise SystemExit("Se necesita un Python de 64 bits: PyTorch no existe para Windows de 32 bits.")
    libre = shutil.disk_usage(MOTOR.anchor or str(MOTOR)).free / 2**30
    if libre < 9:
        raise SystemExit(f"Hay {libre:.1f} GB libres y se necesitan unos 9 GB (descarga + conversion).")


def torch_ok(cpu: bool) -> bool:
    """PyTorch ya instalado y utilizable (con CUDA si se pidio GPU; basta con importarlo en modo CPU)."""
    if not VENV_PY.exists():
        return False
    code = "import torch" if cpu else "import torch; raise SystemExit(0 if torch.cuda.is_available() else 1)"
    return subprocess.run([str(VENV_PY), "-c", code], capture_output=True).returncode == 0


def elegir_modo(pedido: str) -> str:
    """auto -> cu126 si hay NVIDIA (nvidia-smi), en cualquier otro caso cpu."""
    if pedido != "auto":
        return pedido
    return "cu126" if shutil.which("nvidia-smi") else "cpu"


def asegurar_entorno(cuda: str, indice: str | None) -> None:
    if not VENV_PY.exists():
        paso(f"Creando el entorno en {MOTOR / 'venv'}")
        MOTOR.mkdir(parents=True, exist_ok=True)
        ejecutar([sys.executable, "-m", "venv", MOTOR / "venv"])
    cpu = cuda == "cpu"
    if torch_ok(cpu):
        paso("PyTorch ya esta instalado" + ("" if cpu else " con CUDA") + "; se omite")
    else:
        url = indice or f"https://download.pytorch.org/whl/{cuda}"
        paso(f"Instalando PyTorch {TORCH_VERSION} ({'CPU, ~200 MB' if cpu else cuda + ', ~2.5 GB'})  desde {url}")
        ejecutar([VENV_PY, "-m", "pip", "install", "--progress-bar", "off", f"torch=={TORCH_VERSION}", "--index-url", url])
    paso("Instalando diffusers y dependencias")
    ejecutar([VENV_PY, "-m", "pip", "install", "--progress-bar", "off", *PIP_PACKAGES])


def modelo_listo() -> bool:
    return (MODELO / "model_index.json").exists() and any((MODELO / "unet").glob("*.safetensors"))


def asegurar_modelo() -> None:
    if modelo_listo():
        paso("El modelo ya esta instalado; se omite")
        return
    paso(f"Descargando el modelo {MODEL_REPO} (~4.3 GB)")
    ejecutar([VENV_PY, "-c", _DESCARGAR, MODEL_REPO, DESCARGA])
    paso("Convirtiendo a fp16 (carga mas rapida y la mitad de espacio)")
    if MODELO.exists():
        shutil.rmtree(MODELO)
    ejecutar([VENV_PY, "-c", _A_FP16, DESCARGA, MODELO])
    shutil.rmtree(DESCARGA, ignore_errors=True)


def prueba() -> None:
    paso("Prueba real: generando una imagen (con CPU puede tardar 1-3 minutos)")
    with tempfile.TemporaryDirectory() as tmp:
        salida, trabajos = Path(tmp) / "prueba.jpg", Path(tmp) / "jobs.json"
        trabajos.write_text(json.dumps([{
            "prompt": "a lighthouse on a cliff at night, illustration, cinematic lighting",
            "negative_prompt": "text, watermark, lowres", "width": 512, "height": 512, "seed": 1, "out": str(salida),
        }]), encoding="utf-8")
        t0 = time.time()
        r = subprocess.run([str(VENV_PY), str(SCRIPT), "--model-dir", str(MODELO), "--jobs", str(trabajos)], capture_output=True, text=True, encoding="utf-8", errors="replace")
        print(r.stdout.strip())
        if r.returncode != 0 or not salida.exists():
            print(r.stderr[-1500:])
            raise SystemExit("La prueba fallo: el generador no produjo una imagen (revisa la memoria RAM libre y, con NVIDIA, el driver y la VRAM).")
        print(f"OK: imagen generada ({salida.stat().st_size // 1024} KB) en {time.time() - t0:.1f} s", flush=True)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--skip-test", action="store_true", help="omitir la imagen de prueba final")
    ap.add_argument("--cuda", default="auto", help="rueda de PyTorch: auto (por defecto), cu126, cu124, cu121 o cpu")
    ap.add_argument("--torch-index", default=None, help="URL alterna del indice de PyTorch (espejo)")
    a = ap.parse_args()
    comprobar_requisitos()
    modo = elegir_modo(a.cuda)
    print(f"Destino: {MOTOR}  |  modo: {'CPU (sin CUDA)' if modo == 'cpu' else 'GPU NVIDIA (' + modo + ')'}", flush=True)
    asegurar_entorno(modo, a.torch_index)
    asegurar_modelo()
    if not a.skip_test:
        prueba()
    paso("Listo: el generador local de imagenes esta instalado. Reinicia CapiChad si estaba abierto.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
