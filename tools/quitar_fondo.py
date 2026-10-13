#!/usr/bin/env python3
# CapiChad - (c) 2026 Capibara Software (OrtegaGhost) - AGPL-3.0-or-later - https://github.com/OrtegaGhost/capichad-ai
# Aviso de autoria: conserva este encabezado y el archivo NOTICE en copias y derivados.
"""CapiChad - quitar fondo de imagenes, sin internet (modelo U2-Net en ONNX).

Uso:
  python quitar_fondo.py entrada.jpg [salida.png]            una imagen
  python quitar_fondo.py carpeta_entrada carpeta_salida       todas las imagenes de una carpeta

Salida: PNG con fondo transparente. Imprime una linea JSON con el resultado.
Requisitos: onnxruntime, numpy, pillow  +  modelos/u2net.onnx (junto a este archivo).
"""
import json
import os
import sys
import time

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageFilter

AQUI = os.path.dirname(os.path.abspath(__file__))
MODELO = os.environ.get("CAPICHAD_U2NET") or os.path.join(AQUI, "modelos", "u2net.onnx")
EXT = (".jpg", ".jpeg", ".png", ".webp", ".bmp")
_sesion = None


def sesion():
    global _sesion
    if _sesion is None:
        if not os.path.exists(MODELO):
            raise RuntimeError(f"falta el modelo: {MODELO}")
        _sesion = ort.InferenceSession(MODELO, providers=["CPUExecutionProvider"])
    return _sesion


def mascara(img):
    """Mascara 0-255 del primer plano, al tamano de la imagen."""
    w, h = img.size
    a = np.asarray(img.convert("RGB").resize((320, 320), Image.LANCZOS), dtype=np.float32)
    a = a / max(float(a.max()), 1e-6)
    a = (a - np.array([0.485, 0.456, 0.406], dtype=np.float32)) / np.array([0.229, 0.224, 0.225], dtype=np.float32)
    s = sesion()
    y = s.run(None, {s.get_inputs()[0].name: a.transpose(2, 0, 1)[None].astype(np.float32)})[0][0, 0]
    y = (y - y.min()) / max(float(y.max() - y.min()), 1e-6)
    return Image.fromarray((y * 255).astype("uint8")).resize((w, h), Image.LANCZOS)


def quitar_fondo(entrada, salida):
    img = Image.open(entrada)
    img.load()
    m = mascara(img).filter(ImageFilter.GaussianBlur(0.8))     # borde ligeramente suavizado
    out = img.convert("RGBA")
    out.putalpha(m)
    os.makedirs(os.path.dirname(os.path.abspath(salida)), exist_ok=True)
    out.save(salida, format="PNG")
    return salida


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    ent = sys.argv[1]
    t0 = time.time()
    hechos, errores = [], []
    if os.path.isdir(ent):
        dst = sys.argv[2] if len(sys.argv) > 2 else ent.rstrip("\\/") + "_sin_fondo"
        for f in sorted(os.listdir(ent)):
            if f.lower().endswith(EXT):
                try:
                    hechos.append(quitar_fondo(os.path.join(ent, f), os.path.join(dst, os.path.splitext(f)[0] + ".png")))
                except Exception as e:
                    errores.append(f"{f}: {e}")
    else:
        dst = sys.argv[2] if len(sys.argv) > 2 else os.path.splitext(ent)[0] + "_sin_fondo.png"
        try:
            hechos.append(quitar_fondo(ent, dst))
        except Exception as e:
            errores.append(str(e))
    print(json.dumps({"ok": bool(hechos) and not errores, "files": hechos, "errors": errores,
                      "seconds": round(time.time() - t0, 1)}, ensure_ascii=False))
    return 0 if hechos and not errores else 1


if __name__ == "__main__":
    sys.exit(main())
