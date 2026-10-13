#!/usr/bin/env python3
# CapiChad - (c) 2026 Capibara Software (OrtegaGhost) - AGPL-3.0-or-later - https://github.com/OrtegaGhost/capichad-ai
# Aviso de autoria: conserva este encabezado y el archivo NOTICE en copias y derivados.
"""Copia un sitio (libro en linea) para leerlo sin internet. Solo biblioteca estandar.

uso: copiar_sitio.py URL_BASE CARPETA_DESTINO [max_paginas]

- Las paginas HTML solo se siguen dentro del prefijo de URL_BASE.
- Los recursos (css, js, imagenes, fuentes, pdf) del mismo host se bajan siempre.
- Conserva la estructura de rutas, asi los enlaces relativos funcionan offline.
"""
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import deque

UA = "Mozilla/5.0 (CapiChad offline reader)"
RECURSOS = (".css", ".js", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico", ".woff", ".woff2",
            ".ttf", ".otf", ".pdf", ".json", ".mjs", ".txt", ".zip", ".epub")
MAX_RECURSO = 60 * 1024 * 1024


def ruta_local(destino, url):
    p = urllib.parse.urlsplit(url)
    ruta = urllib.parse.unquote(p.path)
    if ruta.endswith("/") or ruta == "":
        ruta += "index.html"
    elif "." not in os.path.basename(ruta):
        ruta += "/index.html"
    seguro = re.sub(r'[<>:"|?*]', "_", ruta.lstrip("/"))
    return os.path.join(destino, p.netloc.replace(":", "_"), *seguro.split("/"))


def main():
    base = sys.argv[1]
    destino = sys.argv[2]
    maximo = int(sys.argv[3]) if len(sys.argv) > 3 else 600
    host = urllib.parse.urlsplit(base).netloc
    prefijo = base.rsplit("/", 1)[0] + "/" if not base.endswith("/") and "." in base.rsplit("/", 1)[-1] else base
    visto, cola = set(), deque([base])
    paginas = recursos = fallos = 0
    while cola and paginas + recursos < maximo * 4:
        url = cola.popleft().split("#")[0]
        if url in visto:
            continue
        visto.add(url)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=40) as r:
                tipo = (r.headers.get("Content-Type") or "").lower()
                largo = int(r.headers.get("Content-Length") or 0)
                if largo > MAX_RECURSO:
                    continue
                datos = r.read()
                final = r.geturl()
        except Exception as e:
            fallos += 1
            sys.stderr.write(f"fallo {url}: {e}\n")
            continue
        es_html = "text/html" in tipo
        if es_html and paginas >= maximo:
            continue
        ruta = ruta_local(destino, final if es_html else url)
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        with open(ruta, "wb") as f:
            f.write(datos)
        if es_html:
            paginas += 1
        else:
            recursos += 1
        if es_html or tipo.startswith("text/css"):
            texto = datos.decode("utf-8", "replace")
            for m in re.finditer(r"""(?:href|src)\s*=\s*(?:["']([^"'#]+)["']|([^\s"'>#]+))|url\(\s*["']?([^"')]+)""",
                                 texto, re.I):
                enlace = (m.group(1) or m.group(2) or m.group(3) or "").strip()
                if not enlace or enlace.startswith(("mailto:", "javascript:", "data:", "tel:")):
                    continue
                absoluto = urllib.parse.urljoin(final if es_html else url, enlace).split("#")[0]
                u = urllib.parse.urlsplit(absoluto)
                if u.netloc != host or u.scheme not in ("http", "https"):
                    continue
                absoluto = urllib.parse.urlunsplit((u.scheme, u.netloc, u.path, u.query, ""))
                ext = os.path.splitext(u.path)[1].lower()
                if ext in RECURSOS:
                    cola.append(absoluto)
                elif absoluto.startswith(prefijo) and (ext in ("", ".html", ".htm")):
                    cola.append(absoluto)
        time.sleep(0.12)
    print(f"{base} -> {paginas} paginas, {recursos} recursos, {fallos} fallos")


if __name__ == "__main__":
    main()
