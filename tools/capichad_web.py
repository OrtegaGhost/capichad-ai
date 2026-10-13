#!/usr/bin/env python3
# CapiChad - (c) 2026 Capibara Software (OrtegaGhost) - AGPL-3.0-or-later - https://github.com/OrtegaGhost/capichad-ai
# Aviso de autoria: conserva este encabezado y el archivo NOTICE en copias y derivados.
"""CapiChad - acceso a internet (Capibara Software). Solo biblioteca estándar, sin claves ni cuotas propias.

Si hay conexión, la IA puede apoyarse en la web para mejorar respuestas, código e imágenes; sin conexión
todo sigue funcionando con la biblioteca local. Todo lo que devuelve es TEXTO NO CONFIABLE (datos, no órdenes).

  capichad_web.py status                         -> {"online": true|false}
  capichad_web.py search "consulta" [-k 5]       -> resultados web (DuckDuckGo; respaldo Wikipedia)
  capichad_web.py fetch URL [--max 6000]         -> texto limpio de una página
  capichad_web.py answer "consulta" [-k 3]       -> búsqueda + texto de las mejores páginas (para RAG)
  capichad_web.py code "consulta" [-k 3]         -> Stack Overflow (respuesta aceptada) + web
  capichad_web.py images "consulta" [-n 8]       -> imágenes con licencia abierta (Openverse / Wikimedia)
  capichad_web.py download URL RUTA              -> baja una imagen (referencia img2img)
"""
import sys, os, re, json, time, gzip, hashlib, argparse, socket, ipaddress, html as _h
import urllib.request, urllib.parse, urllib.error

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) CapiChad/1.4 (+offline-first local assistant)"
CACHE_DIR = os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "CapiChad", "webcache")
TTL = {"search": 6 * 3600, "fetch": 24 * 3600, "code": 12 * 3600, "images": 24 * 3600}
MAX_BYTES = 2_500_000


# ---------- red y caché ----------
def online(timeout=2.5):
    """¿Hay internet? Intento corto a dos destinos distintos (TCP 443), sin depender de DNS del primero."""
    for host in (("1.1.1.1", 443), ("8.8.8.8", 443), ("duckduckgo.com", 443)):
        try:
            socket.create_connection(host, timeout=timeout).close()
            return True
        except OSError:
            continue
    return False


def _cache_path(kind, key):
    return os.path.join(CACHE_DIR, kind + "_" + hashlib.sha1(key.encode("utf-8")).hexdigest() + ".json")


def _cache_get(kind, key):
    p = _cache_path(kind, key)
    try:
        if time.time() - os.path.getmtime(p) < TTL.get(kind, 3600):
            return json.load(open(p, encoding="utf-8"))
    except Exception:
        pass
    return None


def _cache_put(kind, key, val):
    try:
        os.makedirs(CACHE_DIR, exist_ok=True)
        json.dump(val, open(_cache_path(kind, key), "w", encoding="utf-8"), ensure_ascii=False)
    except Exception:
        pass
    return val


def _safe_url(url):
    """Solo http/https hacia internet público: se bloquean localhost y redes privadas (el modelo elige las URL)."""
    u = urllib.parse.urlparse(url)
    if u.scheme not in ("http", "https") or not u.hostname:
        raise ValueError("solo se permiten URL http/https")
    try:
        for fam, _, _, _, sa in socket.getaddrinfo(u.hostname, None):
            ip = ipaddress.ip_address(sa[0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
                raise ValueError("dirección no pública bloqueada")
    except socket.gaierror:
        raise ValueError("no se pudo resolver el sitio")
    return url


def _get(url, data=None, timeout=12, headers=None, binary=False, check=True):
    if check: _safe_url(url)
    h = {"User-Agent": UA, "Accept-Language": "es-MX,es;q=0.9,en;q=0.7", "Accept-Encoding": "gzip"}
    h.update(headers or {})
    req = urllib.request.Request(url, data=data, headers=h)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read(MAX_BYTES)
        if r.headers.get("Content-Encoding") == "gzip" or raw[:2] == b"\x1f\x8b":
            raw = gzip.decompress(raw)
        if binary: return raw, r.headers.get("Content-Type", "")
        cs = r.headers.get_content_charset() or "utf-8"
        return raw.decode(cs, "ignore")


# ---------- limpieza de HTML ----------
def html_to_text(h, limit=6000):
    m = re.search(r"(?is)<title[^>]*>(.*?)</title>", h)
    title = re.sub(r"\s+", " ", _h.unescape(m.group(1))).strip() if m else ""
    h = re.sub(r"(?is)<(script|style|noscript|svg|head|nav|header|footer|aside|form|iframe|button)[^>]*>.*?</\1>", " ", h)
    body = re.search(r"(?is)<(article|main)[^>]*>(.*)</\1>", h)
    if body and len(body.group(2)) > 1500: h = body.group(2)
    h = re.sub(r"(?i)</(p|div|li|h\d|tr|pre)>|<br\s*/?>", "\n", h)
    h = re.sub(r"(?s)<[^>]+>", " ", h)
    h = _h.unescape(h)
    h = re.sub(r"[ \t\r\f\v]+", " ", h)
    h = re.sub(r"\s*\n\s*", "\n", h).strip()
    return title, h[:limit]


# ---------- búsqueda ----------
def _ddg(q, k):
    page = _get("https://html.duckduckgo.com/html/", data=urllib.parse.urlencode({"q": q, "kl": "wt-wt"}).encode(),
                headers={"Content-Type": "application/x-www-form-urlencoded", "Referer": "https://html.duckduckgo.com/"})
    out = []
    for blk in re.split(r'(?i)<div[^>]+class="[^"]*\bresult\b[^"]*"', page)[1:]:
        a = re.search(r'(?is)<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)</a>', blk)
        if not a: continue
        href = _h.unescape(a.group(1))
        m = re.search(r"uddg=([^&]+)", href)
        url = urllib.parse.unquote(m.group(1)) if m else href
        if url.startswith("//"): url = "https:" + url
        if "duckduckgo.com/y.js" in url or "ad_provider" in href: continue          # anuncios
        sn = re.search(r'(?is)class="result__snippet"[^>]*>(.*?)</a>', blk)
        clean = lambda s: re.sub(r"\s+", " ", _h.unescape(re.sub(r"<[^>]+>", "", s))).strip()
        out.append({"title": clean(a.group(2)), "url": url, "snippet": clean(sn.group(1)) if sn else "", "source": "duckduckgo"})
        if len(out) >= k: break
    return out


def _wikipedia(q, k, lang):
    u = f"https://{lang}.wikipedia.org/w/api.php?" + urllib.parse.urlencode(
        {"action": "query", "list": "search", "srsearch": q, "srlimit": k, "format": "json", "srprop": "snippet"})
    d = json.loads(_get(u))
    return [{"title": r["title"], "url": f"https://{lang}.wikipedia.org/wiki/" + urllib.parse.quote(r["title"].replace(" ", "_")),
             "snippet": re.sub(r"<[^>]+>", "", _h.unescape(r.get("snippet", ""))), "source": f"wikipedia-{lang}"}
            for r in d.get("query", {}).get("search", [])]


def web_search(q, k=5):
    q = " ".join(q.split())
    hit = _cache_get("search", f"{q}|{k}")
    if hit is not None: return hit
    res, err = [], []
    for fn in (lambda: _ddg(q, k), lambda: _wikipedia(q, k, "es"), lambda: _wikipedia(q, k, "en")):
        try:
            res = fn()
            if res: break
        except Exception as e:
            err.append(str(e)[:80])
    return _cache_put("search", f"{q}|{k}", res) if res else []


def web_fetch(url, limit=6000):
    hit = _cache_get("fetch", f"{url}|{limit}")
    if hit is not None: return hit
    raw, ctype = _get(url, binary=True, timeout=15)
    if "html" not in ctype.lower() and "text" not in ctype.lower() and "json" not in ctype.lower():
        raise ValueError("tipo de contenido no textual: " + ctype)
    m = re.search(r"charset=([\w-]+)", ctype)
    txt = raw.decode(m.group(1) if m else "utf-8", "ignore")
    title, body = html_to_text(txt, limit) if "html" in ctype.lower() else (url, txt[:limit])
    return _cache_put("fetch", f"{url}|{limit}", {"url": url, "title": title, "text": body})


def web_answer(q, k=3, per_page=2500):
    """Búsqueda + texto de las mejores páginas, listo para usarse como fuentes [n] en un prompt."""
    out = []
    for r in web_search(q, max(k + 2, 5)):
        if len(out) >= k: break
        try:
            if re.search(r"\.(pdf|zip|exe|mp4|jpg|png)(\?|$)", r["url"], re.I): continue
            p = web_fetch(r["url"], per_page)
            if len(p["text"]) < 200:
                p["text"] = (r["snippet"] + "\n" + p["text"]).strip()
            out.append({"kind": "web", "title": r["title"] or p["title"], "url": r["url"], "topic": "Internet",
                        "text": p["text"], "snippet": r["snippet"], "source": r["source"]})
        except Exception:
            if r.get("snippet"):
                out.append({"kind": "web", "title": r["title"], "url": r["url"], "topic": "Internet",
                            "text": r["snippet"], "snippet": r["snippet"], "source": r["source"]})
    return out


def web_code(q, k=3):
    """Stack Overflow vía API pública (sin clave): preguntas relevantes con su respuesta aceptada o más votada."""
    hit = _cache_get("code", f"{q}|{k}")
    if hit is not None: return hit
    out = []
    try:
        u = "https://api.stackexchange.com/2.3/search/advanced?" + urllib.parse.urlencode(
            {"order": "desc", "sort": "relevance", "q": q, "site": "stackoverflow", "pagesize": k, "answers": 1, "filter": "withbody"})
        d = json.loads(_get(u))
        for it in d.get("items", [])[:k]:
            aid = it.get("accepted_answer_id")
            a = json.loads(_get(f"https://api.stackexchange.com/2.3/questions/{it['question_id']}/answers?" + urllib.parse.urlencode(
                {"order": "desc", "sort": "votes", "site": "stackoverflow", "filter": "withbody", "pagesize": 3})))
            ans = next((x for x in a.get("items", []) if x.get("answer_id") == aid), None) or (a.get("items") or [None])[0]
            body = ans.get("body", "") if ans else ""
            code = "\n".join(re.sub(r"<[^>]+>", "", _h.unescape(c)) for c in re.findall(r"(?is)<pre[^>]*>(.*?)</pre>", body))
            text = html_to_text(body, 2500)[1]
            out.append({"kind": "web", "title": _h.unescape(it.get("title", "")), "url": it.get("link"), "topic": "Stack Overflow",
                        "text": (text + ("\n\nCódigo:\n" + code[:1800] if code else "")).strip(),
                        "score": ans.get("score") if ans else None, "source": "stackoverflow"})
    except Exception:
        pass
    if len(out) < k:
        try: out += web_answer(q + " programming", k - len(out))
        except Exception: pass
    return _cache_put("code", f"{q}|{k}", out) if out else []


# ---------- imágenes con licencia abierta ----------
def web_images(q, n=8):
    hit = _cache_get("images", f"{q}|{n}")
    if hit is not None: return hit
    out = []
    try:
        d = json.loads(_get("https://api.openverse.org/v1/images/?" + urllib.parse.urlencode(
            {"q": q, "page_size": n, "license_type": "all-cc", "mature": "false"})))
        for r in d.get("results", []):
            out.append({"title": r.get("title") or q, "thumb": r.get("thumbnail"), "url": r.get("url"), "page": r.get("foreign_landing_url"),
                        "license": f"{(r.get('license') or '').upper()} {r.get('license_version') or ''}".strip(),
                        "creator": r.get("creator"), "source": "openverse"})
    except Exception:
        pass
    if not out:
        try:
            u = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(
                {"action": "query", "generator": "search", "gsrsearch": q + " filetype:bitmap", "gsrnamespace": 6, "gsrlimit": n,
                 "prop": "imageinfo", "iiprop": "url|extmetadata", "iiurlwidth": 480, "format": "json"})
            for p in json.loads(_get(u)).get("query", {}).get("pages", {}).values():
                ii = (p.get("imageinfo") or [{}])[0]
                md = ii.get("extmetadata", {})
                out.append({"title": p.get("title", "").replace("File:", ""), "thumb": ii.get("thumburl"), "url": ii.get("url"),
                            "page": ii.get("descriptionurl"), "license": (md.get("LicenseShortName") or {}).get("value", ""),
                            "creator": re.sub(r"<[^>]+>", "", (md.get("Artist") or {}).get("value", "")), "source": "wikimedia"})
        except Exception:
            pass
    out = [o for o in out if o.get("url")]
    return _cache_put("images", f"{q}|{n}", out) if out else []


def embed_thumbs(items):
    """Añade 'thumb_b64' (data URI) a cada resultado: la interfaz no carga imágenes remotas directamente."""
    import base64
    from concurrent.futures import ThreadPoolExecutor
    def one(it):
        try:
            raw, ct = _get(it.get("thumb") or it["url"], binary=True, timeout=12)
            if ct.lower().startswith("image/") and len(raw) < 400_000:
                it = {**it, "thumb_b64": f"data:{ct.split(';')[0]};base64," + base64.b64encode(raw).decode()}
        except Exception:
            pass
        return it
    with ThreadPoolExecutor(6) as ex:
        return [o for o in ex.map(one, items) if o.get("thumb_b64")]


def web_download(url, dest, max_mb=12):
    raw, ctype = _get(url, binary=True, timeout=25)
    if not ctype.lower().startswith("image/"): raise ValueError("no es una imagen: " + ctype)
    if len(raw) > max_mb * 2**20: raise ValueError("imagen demasiado grande")
    os.makedirs(os.path.dirname(os.path.abspath(dest)), exist_ok=True)
    open(dest, "wb").write(raw)
    return {"ok": True, "path": dest, "bytes": len(raw), "type": ctype}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd"); ap.add_argument("a", nargs="*")
    ap.add_argument("-k", type=int, default=5); ap.add_argument("-n", type=int, default=8); ap.add_argument("--max", type=int, default=6000)
    ap.add_argument("--embed", action="store_true", help="images: incluye miniaturas en base64")
    ar = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    q = " ".join(ar.a)
    try:
        if ar.cmd == "status": r = {"online": online()}
        elif ar.cmd == "search": r = web_search(q, ar.k)
        elif ar.cmd == "fetch": r = web_fetch(ar.a[0], ar.max)
        elif ar.cmd == "answer": r = web_answer(q, ar.k)
        elif ar.cmd == "code": r = web_code(q, ar.k)
        elif ar.cmd == "images":
            r = web_images(q, ar.n)
            if ar.embed: r = embed_thumbs(r)
        elif ar.cmd == "download": r = web_download(ar.a[0], ar.a[1])
        else: raise SystemExit("comando desconocido: " + ar.cmd)
        print(json.dumps(r, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"error": str(e)[:300]}, ensure_ascii=False))
        sys.exit(1)


if __name__ == "__main__":
    main()
