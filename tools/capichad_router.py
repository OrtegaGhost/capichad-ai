#!/usr/bin/env python3
# CapiChad - (c) 2026 Capibara Software (OrtegaGhost) - AGPL-3.0-or-later - https://github.com/OrtegaGhost/capichad-ai
# Aviso de autoria: conserva este encabezado y el archivo NOTICE en copias y derivados.
"""CapiChad Router: agente enrutador de modelos locales (solo biblioteca estandar).

Expone una API compatible con OpenAI en http://127.0.0.1:11500/v1 y reenvia a Ollama
(11434) eligiendo el modelo segun la tarea:

  chat sencillo ........ qwen3:4b          (rapido, siempre cabe)
  codigo / agente ...... gpt-oss:20b       (principal, cabe entero en RAM)
  codigo pesado ........ qwen3-coder:30b   (solo si hay RAM libre suficiente)
  imagen adjunta ....... qwen2.5vl:3b      (describe la imagen y pasa el texto al modelo de codigo)

Antes de cada peticion descarga de memoria los demas modelos (solo uno grande a la vez).
Forzar a mano: escribe @rapido, @codigo, @pesado o @chat en el mensaje.
Estado: GET /status   |   Modelo a usar desde OpenCode/clientes: "capichad-auto".
"""
import ctypes
import http.client
import json
import os
import re
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

OLLAMA = ("127.0.0.1", 11434)
PORT = int(os.environ.get("CAPICHAD_ROUTER_PORT", "11500"))
MODELOS = {
    "chat": os.environ.get("CAPICHAD_M_CHAT", "qwen3:4b-instruct"),
    "codigo": os.environ.get("CAPICHAD_M_CODIGO", "gpt-oss:20b"),
    "pesado": os.environ.get("CAPICHAD_M_PESADO", "qwen3-coder:30b"),
    "vision": os.environ.get("CAPICHAD_M_VISION", "qwen2.5vl:3b"),
}
RAM_MIN_PESADO_GB = float(os.environ.get("CAPICHAD_RAM_PESADO_GB", "18"))
TOKENS_PESADO = int(os.environ.get("CAPICHAD_TOKENS_PESADO", "12000"))

KW_CODIGO = [
    "codigo", "código", "funcion", "función", "clase", "script", "bug", "error", "compil", "refactor",
    "api", "endpoint", "html", "css", "javascript", "typescript", "python", "react", "sql", "test",
    "implementa", "programa", "programar", "app", "interfaz", "componente", "git", "docker", "json",
    "stack trace", "traceback", "exception", "def ", "class ", "import ", "function", "const ", "npm",
    "pip ", "crea un", "crea una", "arregla", "depura", "debug", "genera un", "escribe un",
]
KW_PESADO = [
    "refactor", "arquitectura", "migrar", "migracion", "migración", "proyecto completo", "varios archivos",
    "multiples archivos", "múltiples archivos", "desde cero", "full stack", "fullstack", "backend y frontend",
    "todo el repositorio", "todo el proyecto", "optimiza el rendimiento", "algoritmo complejo",
    "diseña el sistema", "sistema completo", "reescribe", "reescribir", "framework propio",
]
FORZAR = {"@rapido": "codigo", "@rápido": "codigo", "@codigo": "codigo", "@código": "codigo",
          "@pesado": "pesado", "@chat": "chat"}

_decisiones = []
_lock = threading.Lock()


# ---------- utilidades ----------
class _MemStatus(ctypes.Structure):
    _fields_ = [("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong),
                ("ullTotalPhys", ctypes.c_ulonglong), ("ullAvailPhys", ctypes.c_ulonglong),
                ("ullTotalPageFile", ctypes.c_ulonglong), ("ullAvailPageFile", ctypes.c_ulonglong),
                ("ullTotalVirtual", ctypes.c_ulonglong), ("ullAvailVirtual", ctypes.c_ulonglong),
                ("sullAvailExtendedVirtual", ctypes.c_ulonglong)]


def ram_libre_gb():
    try:
        m = _MemStatus()
        m.dwLength = ctypes.sizeof(m)
        ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(m))
        return m.ullAvailPhys / 2**30
    except Exception:
        return 0.0


def ollama(metodo, ruta, cuerpo=None, timeout=600):
    c = http.client.HTTPConnection(*OLLAMA, timeout=timeout)
    h = {"Content-Type": "application/json"} if cuerpo is not None else {}
    c.request(metodo, ruta, json.dumps(cuerpo) if cuerpo is not None else None, h)
    r = c.getresponse()
    return c, r


def ollama_json(metodo, ruta, cuerpo=None, timeout=600):
    c, r = ollama(metodo, ruta, cuerpo, timeout)
    try:
        return json.loads(r.read() or b"{}")
    finally:
        c.close()


def instalados():
    try:
        return {m["name"] for m in ollama_json("GET", "/api/tags", timeout=10).get("models", [])}
    except Exception:
        return set()


def resolver(nombre):
    """Prefiere la variante con contexto ajustado '<nombre>-cl' si existe."""
    inst = instalados()
    base = nombre.split(":")[0]
    tag = nombre.split(":")[1] if ":" in nombre else "latest"
    for cand in (f"{base}-cl:{tag}", f"{base}-cl:latest", nombre):
        if cand in inst:
            return cand
    return nombre


def cargados():
    try:
        return [m["name"] for m in ollama_json("GET", "/api/ps", timeout=10).get("models", [])]
    except Exception:
        return []


def descargar_otros(destino):
    for n in cargados():
        if n != destino:
            try:
                ollama_json("POST", "/api/generate", {"model": n, "keep_alive": 0}, timeout=60)
            except Exception:
                pass


def texto_de(msg):
    c = msg.get("content", "")
    if isinstance(c, str):
        return c
    return " ".join(p.get("text", "") for p in c if isinstance(p, dict) and p.get("type") == "text")


def hay_imagenes(mensajes):
    for m in mensajes:
        c = m.get("content")
        if isinstance(c, list) and any(isinstance(p, dict) and p.get("type") == "image_url" for p in c):
            return True
    return False


# ---------- decision ----------
def _tiene(texto, palabras):
    """Las palabras cortas (<=4 letras) solo cuentan como palabra completa: 'app' no es 'mapa'."""
    for k in palabras:
        k = k.strip()
        if len(k) <= 4 and k.isalpha():
            if re.search(r"\b" + re.escape(k) + r"\b", texto):
                return True
        elif k in texto:
            return True
    return False


def decidir(cuerpo):
    mensajes = cuerpo.get("messages", [])
    ultimo = next((texto_de(m) for m in reversed(mensajes) if m.get("role") == "user"), "")
    bajo = ultimo.lower()
    todo = " ".join(texto_de(m) for m in mensajes)
    tokens = len(todo) // 4

    for etiqueta, clase in FORZAR.items():
        if etiqueta in bajo:
            return clase, f"forzado por {etiqueta}"
    con_herramientas = bool(cuerpo.get("tools"))
    es_codigo = con_herramientas or "```" in ultimo or _tiene(bajo, KW_CODIGO)
    es_pesado = tokens > TOKENS_PESADO or _tiene(bajo, KW_PESADO)
    if es_codigo and es_pesado:
        return "pesado", f"codigo pesado (tokens~{tokens})"
    if es_codigo:
        return "codigo", "codigo/agente" + (" con herramientas" if con_herramientas else "")
    if tokens > TOKENS_PESADO:
        return "codigo", f"contexto largo (tokens~{tokens})"
    return "chat", "conversacion sencilla"


def describir_imagenes(mensajes, log):
    """Pasa cada imagen por el modelo de vision y la sustituye por texto."""
    vis = resolver(MODELOS["vision"])
    descargar_otros(vis)
    nuevos = []
    for m in mensajes:
        c = m.get("content")
        if not isinstance(c, list):
            nuevos.append(m)
            continue
        partes = []
        for p in c:
            if isinstance(p, dict) and p.get("type") == "image_url":
                url = p["image_url"]["url"] if isinstance(p.get("image_url"), dict) else p.get("image_url", "")
                b64 = url.split(",", 1)[1] if url.startswith("data:") else None
                if b64 is None:
                    partes.append({"type": "text", "text": "[imagen remota no disponible sin internet]"})
                    continue
                t0 = time.time()
                r = ollama_json("POST", "/api/chat", {
                    "model": vis, "stream": False, "keep_alive": 0,
                    "messages": [{"role": "user", "images": [b64], "content": (
                        "Describe esta interfaz de usuario con el detalle necesario para que un programador la "
                        "reconstruya sin verla: estructura general, secciones, componentes, textos visibles, "
                        "colores aproximados (hex), tipografia, espaciados y distribucion. Responde en espanol.")}],
                }, timeout=900)
                desc = r.get("message", {}).get("content", "(sin descripcion)")
                log.append(f"vision {vis}: {len(desc)} car en {time.time() - t0:.0f}s")
                partes.append({"type": "text", "text": "[Descripcion de la imagen adjunta]\n" + desc})
            else:
                partes.append(p)
        nuevos.append({**m, "content": partes})
    return nuevos


def elegir_modelo(clase, log):
    if clase == "pesado":
        descargar_otros(resolver(MODELOS["pesado"]))
        libre = ram_libre_gb()
        if libre < RAM_MIN_PESADO_GB:
            log.append(f"RAM libre {libre:.1f} GB < {RAM_MIN_PESADO_GB:.0f} GB: se baja a modelo de codigo")
            clase = "codigo"
    modelo = resolver(MODELOS[clase])
    descargar_otros(modelo)
    return clase, modelo


# ---------- servidor ----------
class H(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.0"

    def log_message(self, *a):
        pass

    def _json(self, codigo, obj):
        b = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        if self.path in ("/v1/models", "/models"):
            ids = ["capichad-auto"] + [MODELOS[k] for k in MODELOS]
            return self._json(200, {"object": "list", "data": [{"id": i, "object": "model", "owned_by": "capichad"} for i in ids]})
        if self.path == "/status":
            with _lock:
                ult = list(_decisiones[-15:])
            return self._json(200, {"ram_libre_gb": round(ram_libre_gb(), 1), "cargados": cargados(),
                                    "modelos": MODELOS, "instalados": sorted(instalados()), "ultimas": ult})
        self._json(404, {"error": "no encontrado"})

    def _imagenes(self):
        """POST /v1/images/generations (formato OpenAI): genera con el motor local y devuelve base64."""
        import base64
        import tempfile
        try:
            c = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
            prompt = (c.get("prompt") or "").strip()
            if not prompt:
                return self._json(400, {"error": {"message": "falta 'prompt'"}})
            n = max(1, min(int(c.get("n", 1)), 4))
            w, h = (int(x) for x in str(c.get("size", "512x512")).lower().split("x"))
            sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
            import capichad_imagen
            carpeta = tempfile.mkdtemp(prefix="capichad_img_")
            salidas = [os.path.join(carpeta, f"imagen_{i + 1:02d}.jpg") for i in range(n)]
            r = capichad_imagen.generar([prompt] * n, salidas, w, h, c.get("seed"), int(c.get("steps", 4)),
                                        c.get("image"), float(c.get("strength", 0.6)), bool(c.get("translate", False)))
            with _lock:
                _decisiones.append({"hora": time.strftime("%H:%M:%S"), "clase": "imagen", "modelo": "sd1.5-lcm",
                                    "motivo": f"{n} imagen(es) {w}x{h}", "ram_libre_gb": round(ram_libre_gb(), 1),
                                    "notas": r.get("errors", [])})
            if not r["files"]:
                return self._json(500, {"error": {"message": "; ".join(r["errors"]) or "sin imagen"}})
            datos = []
            for f in r["files"]:
                if c.get("response_format") == "url":
                    datos.append({"url": "file:///" + f.replace("\\", "/")})
                else:
                    with open(f, "rb") as fh:
                        datos.append({"b64_json": base64.b64encode(fh.read()).decode()})
            self._json(200, {"created": int(time.time()), "data": datos, "seconds": r["seconds"]})
        except Exception as e:
            self._json(502, {"error": {"message": f"router: {e}"}})

    def do_POST(self):
        if self.path.endswith("/images/generations"):
            return self._imagenes()
        if not self.path.endswith("/chat/completions"):
            return self._json(404, {"error": "solo /v1/chat/completions y /v1/images/generations"})
        try:
            cuerpo = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        except Exception as e:
            return self._json(400, {"error": str(e)})
        log = []
        t0 = time.time()
        try:
            pedido = cuerpo.get("model", "capichad-auto")
            explicito = pedido not in ("capichad-auto", "auto", "")
            if hay_imagenes(cuerpo.get("messages", [])):
                cuerpo["messages"] = describir_imagenes(cuerpo["messages"], log)
                if not explicito:
                    cuerpo["_forzar"] = None
            if explicito:
                modelo = resolver(pedido)          # prefiere la variante '-cl' (contexto ajustado): la base trunca a 4K
                clase, motivo = "manual", f"modelo pedido: {pedido}" + (f" -> {modelo}" if modelo != pedido else "")
                descargar_otros(modelo)
            else:
                clase, motivo = decidir(cuerpo)
                clase, modelo = elegir_modelo(clase, log)
            cuerpo.pop("_forzar", None)
            cuerpo["model"] = modelo
            reg = {"hora": time.strftime("%H:%M:%S"), "clase": clase, "modelo": modelo, "motivo": motivo,
                   "ram_libre_gb": round(ram_libre_gb(), 1), "notas": log}
            with _lock:
                _decisiones.append(reg)
            sys.stderr.write(json.dumps(reg, ensure_ascii=False) + "\n")
            sys.stderr.flush()
            c, r = ollama("POST", "/v1/chat/completions", cuerpo, timeout=3600)
            self.send_response(r.status)
            for k in ("Content-Type", "Cache-Control"):
                if r.getheader(k):
                    self.send_header(k, r.getheader(k))
            self.send_header("X-Capichad-Modelo", modelo)
            self.send_header("X-Capichad-Clase", clase)
            self.end_headers()
            while True:
                trozo = r.read(1024) if cuerpo.get("stream") else r.read(65536)
                if not trozo:
                    break
                self.wfile.write(trozo)
                self.wfile.flush()
            c.close()
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as e:
            try:
                self._json(502, {"error": {"message": f"router: {e}", "type": "router_error"}})
            except Exception:
                pass


def main():
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), H)
    sys.stderr.write(f"CapiChad Router en http://127.0.0.1:{PORT}/v1  (modelo: capichad-auto)\n")
    sys.stderr.flush()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
