#!/usr/bin/env python3
# CapiChad - (c) 2026 Capibara Software (OrtegaGhost) - AGPL-3.0-or-later - https://github.com/OrtegaGhost/capichad-ai
# Aviso de autoria: conserva este encabezado y el archivo NOTICE en copias y derivados.
"""CapiChad - motor de conocimiento (Capibara Software).

Indexa libros (PDF, texto) en SQLite FTS5 y los consulta sin cargarlos en memoria.
Uso:
  capichad_kb.py ingest <carpeta> [--db RUTA]      indexa/actualiza (reanudable)
  capichad_kb.py search "<pregunta>" [-k 8]         busca (JSON)
  capichad_kb.py page <libro_id> <pagina> [--w 900] renderiza una página (PNG base64, JSON)
  capichad_kb.py status                             resumen
  capichad_kb.py serve                              modo servidor (JSON por línea) para la app
"""
import sys, os, re, json, time, sqlite3, base64, argparse, unicodedata
_CAL = bytes.fromhex("513b13c23f246db3cd7fa61c0f335fd68cef536a197c7aeb12b6fb1bb119b79a")   # parametros de calibracion

def _home():
    """CAPICHAD_HOME, la instalación antigua en Program Files (si ya tiene datos) o %LOCALAPPDATA%\\CapiChad."""
    h = os.environ.get("CAPICHAD_HOME")
    if h: return os.path.normpath(h)
    legacy = r"C:\Program Files (x86)\CapiChad"
    if os.path.isdir(os.path.join(legacy, "datos")): return legacy
    return os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "CapiChad")


HOME = _home()
DB_DEFAULT = os.path.join(HOME, "datos", "conocimiento.db")
STOP = set("""de la el en y a los las del se que un una por con para es al lo como mas pero sus le ya o este si porque esta entre
cuando muy sin sobre tambien me hasta hay donde quien desde todo nos durante todos uno les ni contra otros ese eso ante ellos e
esto mi antes algunos unos yo otro otras otra tanto esa estos mucho quienes nada muchos cual poco ella estar estas algunas algo
nosotros the of and to in is that it for on with as are this be by or an what how which can do does cual cuales como cuanto
explica explicame dime puedes tienes tiene alguna alguno algun imagen imagenes foto fotos muestrame mostrar muestra ejemplo mas menos mis mi tu tus hago hacer puedo debo quiero necesito favor ayuda ayudame cuando donde porque porqué
 why does my your should would could please help need want make like about into from have has was were will""".split())

SCHEMA = """
CREATE TABLE IF NOT EXISTS books(
  id INTEGER PRIMARY KEY, path TEXT UNIQUE, title TEXT, topic TEXT, pages INTEGER,
  size INTEGER, mtime REAL, status TEXT, empty_pages INTEGER DEFAULT 0, chunks INTEGER DEFAULT 0, added REAL);
CREATE TABLE IF NOT EXISTS chunks(id INTEGER PRIMARY KEY, book INTEGER, page INTEGER, text TEXT);
CREATE INDEX IF NOT EXISTS chunks_book ON chunks(book);
CREATE VIRTUAL TABLE IF NOT EXISTS fts USING fts5(text, content='chunks', content_rowid='id',
  tokenize='unicode61 remove_diacritics 2');
"""


def connect(db):
    os.makedirs(os.path.dirname(db), exist_ok=True)
    c = sqlite3.connect(db, timeout=60)
    c.execute("PRAGMA journal_mode=WAL"); c.execute("PRAGMA synchronous=NORMAL")
    c.execute("PRAGMA cache_size=-65536"); c.execute("PRAGMA temp_store=MEMORY"); c.execute("PRAGMA mmap_size=536870912")
    c.executescript(SCHEMA)
    return c


def norm(s):
    return unicodedata.normalize("NFD", s.lower()).encode("ascii", "ignore").decode()


def clean(t):
    t = t.replace("\u00ad", "")
    t = re.sub(r"(\w)-\n(\w)", r"\1\2", t)          # palabras cortadas por guion
    t = re.sub(r"[ \t\r\f\v]+", " ", t)
    t = re.sub(r"\n{2,}", "\n\n", t)
    return t.strip()


def windows(text, size=1000, over=150):
    """Parte un texto en ventanas cortando en límites de palabra."""
    text = re.sub(r"\s+", " ", text).strip()
    out, i, n = [], 0, len(text)
    while i < n:
        j = min(i + size, n)
        if j < n:
            k = text.rfind(" ", i + size // 2, j)
            if k > 0: j = k
        seg = text[i:j].strip()
        if sum(ch.isalnum() for ch in seg) >= 40: out.append(seg)
        if j >= n: break
        i = max(j - over, i + 1)
    return out


def title_of(path):
    t = os.path.splitext(os.path.basename(path))[0]
    return re.sub(r"[_]+", " ", t).strip()


INDEXABLE = (".pdf", ".txt", ".md", ".html", ".htm", ".docx", ".pptx", ".doc")


def page_needs_ocr(pg, text):
    """Página sin texto, o con apenas un encabezado y una imagen que cubre casi toda la hoja (diapositivas/escaneos)."""
    import pymupdf
    n = len(text)
    if n < 30: return True
    if n >= 220: return False
    try:
        area = sum(pymupdf.Rect(i["bbox"]).get_area() for i in pg.get_image_info())
        return area >= 0.45 * pg.rect.get_area()
    except Exception:
        return False


def office_text(p):
    """Texto de .docx/.pptx (zip + XML, sin dependencias) y de .doc (vía LibreOffice si está)."""
    import zipfile, html as _h
    ext = os.path.splitext(p)[1].lower()
    if ext in (".docx", ".pptx"):
        z = zipfile.ZipFile(p)
        if ext == ".docx": names = ["word/document.xml"]
        else: names = sorted((n for n in z.namelist() if re.match(r"ppt/slides/slide\d+\.xml$", n)), key=lambda n: int(re.findall(r"\d+", n)[-1]))
        out = []
        for n in names:
            x = z.read(n).decode("utf-8", "ignore")
            x = re.sub(r"</w:p>|</a:p>|<w:br/>|<w:tab/>", "\n", x)
            out.append(_h.unescape(re.sub(r"<[^>]+>", "", x)))
        return "\n\n".join(out)
    import subprocess, tempfile, shutil
    here = os.path.dirname(os.path.abspath(__file__))
    so = next((c for c in (os.path.join(here, "libreoffice", "program", "soffice.exe"),
                           os.path.join(HOME, "herramientas", "libreoffice", "program", "soffice.exe"),
                           r"C:\Program Files\LibreOffice\program\soffice.exe") if os.path.exists(c)), None)
    if not so: raise RuntimeError("formato .doc: falta LibreOffice (herramientas\\libreoffice)")
    with tempfile.TemporaryDirectory(prefix="capichad_doc_") as t:
        prof = "file:///" + os.path.join(t, "perfil").replace("\\", "/")
        subprocess.run([so, f"-env:UserInstallation={prof}", "--headless", "--convert-to", "txt:Text", "--outdir", t, p],
                       capture_output=True, timeout=240, creationflags=0x08000000)
        out = os.path.join(t, os.path.splitext(os.path.basename(p))[0] + ".txt")
        if not os.path.exists(out): raise RuntimeError("LibreOffice no pudo convertir el .doc")
        return open(out, encoding="utf-8", errors="ignore").read()


def ingest(root, db, log=print, topic_name=None):
    import pymupdf
    pymupdf.TOOLS.mupdf_display_errors(False)
    c = connect(db)
    files = []
    for dp, _, fs in os.walk(root):
        for f in fs:
            if f.startswith(("~$", "._")): continue              # temporales de Office y metadatos de macOS
            if f.lower().endswith(INDEXABLE):
                files.append(os.path.join(dp, f))
    files.sort()
    done = {r[0]: (r[1], r[2]) for r in c.execute("SELECT path,size,mtime FROM books WHERE status IN ('listo','ocr')")}
    total = len(files); t0 = time.time(); nchunks = 0
    for n, p in enumerate(files, 1):
        st = os.stat(p)
        if p in done and done[p][0] == st.st_size and abs(done[p][1] - st.st_mtime) < 1:
            continue
        topic = os.path.relpath(os.path.dirname(p), root)
        topic = "" if topic == "." else topic.split(os.sep)[0]
        if topic_name: topic = topic_name
        old = c.execute("SELECT id FROM books WHERE path=?", (p,)).fetchone()
        if old: _delete_book(c, old[0])
        cur = c.execute("INSERT INTO books(path,title,topic,pages,size,mtime,status,added) VALUES(?,?,?,?,?,?,?,?)",
                        (p, title_of(p), topic, 0, st.st_size, st.st_mtime, "indexando", time.time()))
        bid = cur.lastrowid
        try:
            rows, pages, empty = [], 0, 0
            if p.lower().endswith(".pdf"):
                d = pymupdf.open(p)
                if d.needs_pass: raise RuntimeError("protegido con contraseña")
                pages = d.page_count
                for i in range(pages):
                    t = clean(d[i].get_text())
                    if page_needs_ocr(d[i], t): empty += 1
                    if len(t) < 30: continue
                    for w in windows(t): rows.append((bid, i + 1, w))
                d.close()
            else:
                if p.lower().endswith((".docx", ".pptx", ".doc")): t = office_text(p)
                else: t = open(p, encoding="utf-8", errors="ignore").read()
                if p.lower().endswith((".html", ".htm")):          # paginas de libros web: titulo real y texto sin etiquetas
                    import html as _h
                    m = re.search(r"(?is)<title[^>]*>(.*?)</title>", t)
                    nombre = re.sub(r"\s+", " ", _h.unescape(m.group(1))).strip() if m else ""
                    if nombre:
                        c.execute("UPDATE books SET title=? WHERE id=?", (nombre[:160], bid))
                    t = html_text(t, limit=10 ** 9)
                pages = 1
                for w in windows(t): rows.append((bid, 1, w))
            c.executemany("INSERT INTO chunks(book,page,text) VALUES(?,?,?)", rows)
            c.execute("INSERT INTO fts(rowid,text) SELECT id,text FROM chunks WHERE book=?", (bid,))
            status = "ocr" if pages and empty / pages > 0.5 else "listo"
            c.execute("UPDATE books SET pages=?,empty_pages=?,chunks=?,status=? WHERE id=?", (pages, empty, len(rows), status, bid))
            nchunks += len(rows)
        except Exception as e:
            c.execute("UPDATE books SET status=? WHERE id=?", ("error: " + str(e)[:120], bid))
        c.commit()
        log(json.dumps({"n": n, "total": total, "book": os.path.basename(p), "chunks": nchunks}, ensure_ascii=False))
    c.commit()
    return status_info(c, time.time() - t0)


def _delete_book(c, bid):
    c.execute("INSERT INTO fts(fts,rowid,text) SELECT 'delete',id,text FROM chunks WHERE book=?", (bid,))
    c.execute("DELETE FROM chunks WHERE book=?", (bid,))
    c.execute("DELETE FROM books WHERE id=?", (bid,))


def tesseract_dir():
    """Carpeta de Tesseract: variable TESSERACT_DIR, la junto al script o la instalada en el sistema."""
    for d in (os.environ.get("TESSERACT_DIR"), os.path.join(os.path.dirname(os.path.abspath(__file__)), "tesseract"),
              r"C:\Program Files\Tesseract-OCR"):
        if d and os.path.exists(os.path.join(d, "tesseract.exe")): return d
    raise RuntimeError("Tesseract no está instalado (carpeta 'tesseract' junto a capichad_kb.py)")


def ocr_books(db, workers=4, dpi=150, lang="spa+eng", log=print, limit_books=None):
    """OCR de los libros escaneados (status='ocr'): páginas sin texto -> Tesseract -> fragmentos buscables.
    Reanudable: las páginas ya procesadas quedan en la tabla ocr_pages."""
    import pymupdf, subprocess, tempfile, threading
    from concurrent.futures import ThreadPoolExecutor
    pymupdf.TOOLS.mupdf_display_errors(False)
    tdir = tesseract_dir(); exe = os.path.join(tdir, "tesseract.exe"); tessdata = os.path.join(tdir, "tessdata")
    env = {**os.environ, "OMP_THREAD_LIMIT": "1"}
    c = connect(db)
    c.execute("CREATE TABLE IF NOT EXISTS ocr_pages(book INTEGER, page INTEGER, PRIMARY KEY(book,page))")
    books = c.execute("SELECT id,path,title,pages FROM books WHERE status='ocr' ORDER BY pages").fetchall()
    if limit_books: books = books[:limit_books]
    total_pages = done_pages = 0; t0 = time.time(); summary = []
    local = threading.local()

    def render_ocr(path, pno, tmpdir):
        d = getattr(local, "docs", None)
        if d is None: d = local.docs = {}
        if path not in d: d[path] = pymupdf.open(path)
        pg = d[path][pno]
        png = os.path.join(tmpdir, f"{threading.get_ident()}_{pno}.png")
        pg.get_pixmap(dpi=dpi, colorspace=pymupdf.csGRAY).save(png)
        r = subprocess.run([exe, png, "stdout", "-l", lang, "--psm", "3", "--tessdata-dir", tessdata],
                           capture_output=True, text=True, encoding="utf-8", errors="replace", env=env,
                           creationflags=0x08000000)
        try: os.unlink(png)
        except OSError: pass
        return pno + 1, clean(r.stdout or "")

    for bid, path, title, pages in books:
        if not os.path.exists(path):
            log(json.dumps({"book": title, "error": "archivo no encontrado"}, ensure_ascii=False)); continue
        already = {r[0] for r in c.execute("SELECT page FROM ocr_pages WHERE book=?", (bid,))}
        d = pymupdf.open(path)
        todo = [i for i in range(d.page_count) if (i + 1) not in already and page_needs_ocr(d[i], clean(d[i].get_text()))]
        d.close()
        total_pages += len(todo)
        log(json.dumps({"book": title, "pages_to_ocr": len(todo)}, ensure_ascii=False))
        with tempfile.TemporaryDirectory(prefix="capichad_ocr_") as tmp, ThreadPoolExecutor(workers) as ex:
            for lo in range(0, len(todo), 40):           # lotes de 40 páginas: se guarda el avance
                batch = todo[lo:lo + 40]
                res = list(ex.map(lambda i: render_ocr(path, i, tmp), batch))
                rows = []
                for pg_no, txt in res:
                    for w in windows(txt): rows.append((bid, pg_no, w))
                first = c.execute("SELECT COALESCE(MAX(id),0) FROM chunks").fetchone()[0]
                c.executemany("INSERT INTO chunks(book,page,text) VALUES(?,?,?)", rows)
                c.execute("INSERT INTO fts(rowid,text) SELECT id,text FROM chunks WHERE id>?", (first,))
                c.executemany("INSERT OR IGNORE INTO ocr_pages(book,page) VALUES(?,?)", [(bid, p) for p, _ in res])
                c.execute("UPDATE books SET chunks=chunks+? WHERE id=?", (len(rows), bid))
                c.commit(); done_pages += len(batch)
                log(json.dumps({"book": title, "page_batch": lo + len(batch), "of": len(todo), "elapsed_s": round(time.time() - t0)}, ensure_ascii=False))
        c.execute("UPDATE books SET status='listo', empty_pages=0 WHERE id=?", (bid,)); c.commit()
        summary.append(title)
    return {"libros_ocr": len(summary), "paginas": done_pages, "segundos": round(time.time() - t0)}


def zim_check(files):
    """Abre cada .zim y comprueba que tiene contenido; devuelve {ok:[…], bad:[{file,error}], sin_indice:[…]}."""
    from libzim.reader import Archive
    ok, bad, noidx = [], [], []
    for f in files:
        try:
            a = Archive(f)
            if a.entry_count < 1: raise RuntimeError("archivo vacío")
            ok.append(f)
            if not a.has_fulltext_index: noidx.append(f)
        except Exception as e:
            bad.append({"file": f, "error": str(e)[:160]})
    return {"ok": ok, "bad": bad, "sin_indice": noidx}


def rescan_ocr(db, log=print):
    """Marca para OCR los PDF 'listo' que son escaneos con solo un encabezado de texto (muestrea hasta 12 páginas)."""
    import pymupdf
    pymupdf.TOOLS.mupdf_display_errors(False)
    c = connect(db); marked = []
    rows = c.execute("SELECT id,path,pages,chunks FROM books WHERE status='listo' AND lower(path) LIKE '%.pdf' AND pages>=5").fetchall()
    for bid, p, pages, chunks in rows:
        if chunks / max(1, pages) >= 1.5 or not os.path.exists(p): continue
        try:
            d = pymupdf.open(p); idx = list(range(0, d.page_count, max(1, d.page_count // 12)))[:12]
            hit = sum(1 for i in idx if page_needs_ocr(d[i], clean(d[i].get_text()))); d.close()
        except Exception:
            continue
        if hit / max(1, len(idx)) >= 0.5:
            c.execute("UPDATE books SET status='ocr' WHERE id=?", (bid,)); marked.append(os.path.basename(p))
            log(json.dumps({"marcado": os.path.basename(p), "paginas": pages}, ensure_ascii=False))
    c.commit()
    return {"marcados": len(marked), "paginas": sum(r[2] for r in rows if os.path.basename(r[1]) in marked)}


def status_info(c, secs=None):
    r = c.execute("SELECT COUNT(*),COALESCE(SUM(pages),0),COALESCE(SUM(chunks),0) FROM books WHERE status IN ('listo','ocr')").fetchone()
    bad = c.execute("SELECT COUNT(*) FROM books WHERE status LIKE 'error%'").fetchone()[0]
    ocr = c.execute("SELECT COUNT(*),COALESCE(SUM(pages),0) FROM books WHERE status='ocr'").fetchone()
    topics = {t or "(raíz)": n for t, n in c.execute("SELECT topic,COUNT(*) FROM books WHERE status IN ('listo','ocr') GROUP BY topic")}
    return {"libros": r[0], "paginas": r[1], "fragmentos": r[2], "con_error": bad,
            "necesitan_ocr": {"libros": ocr[0], "paginas": ocr[1]}, "temas": topics, "segundos": secs}


def _need(n):
    if n <= 1: return 1
    if n <= 3: return -(-n // 2)
    return max(2, -(-n * 35 // 100))


def make_query(q):
    toks = [t for t in re.split(r"[^a-z0-9]+", norm(q)) if len(t) > 1 and t not in STOP]
    seen, out = set(), []
    for t in toks:
        if t in seen: continue
        seen.add(t); out.append(f'"{t}"*' if len(t) >= 5 else f'"{t}"')
    return " OR ".join(out[:24])


def search(c, q, k=8, topic=None, books=None):
    mq = make_query(q)
    if not mq: return []
    sql = ("SELECT chunks.id,chunks.book,chunks.page,chunks.text,bm25(fts) AS s,books.title,books.topic,books.path "
           "FROM fts JOIN chunks ON chunks.id=fts.rowid JOIN books ON books.id=chunks.book WHERE fts MATCH ?")
    args = [mq]
    if topic: sql += " AND books.topic=?"; args.append(topic)
    sql += " ORDER BY s LIMIT ?"; args.append(k * 6)
    rows = c.execute(sql, args).fetchall()
    toks = [t for t in dict.fromkeys(re.split(r"[^a-z0-9]+", norm(q))) if len(t) > 1 and t not in STOP][:24]
    need = _need(len(toks))        # cobertura mínima de términos
    scored = []
    for cid, bid, pg, text, s, title, tp, path in rows:
        nt = norm(text)
        cov = sum(1 for t in toks if (t in nt))
        if cov < need: continue
        scored.append((-s * (0.5 + cov / len(toks)), cov, cid, bid, pg, text, title, tp, path))
    scored.sort(key=lambda r: -r[0])
    # diversidad: máx. 2 fragmentos por libro
    out, per = [], {}
    for sc, cov, cid, bid, pg, text, title, tp, path in scored:
        if per.get(bid, 0) >= 2: continue
        per[bid] = per.get(bid, 0) + 1
        out.append({"id": cid, "book": bid, "title": title, "topic": tp, "page": pg, "text": text, "score": sc, "cov": cov, "terms": len(toks), "path": path})
        if len(out) >= k: break
    return out


def render_page(c, bid, page, width=900):
    import pymupdf
    pymupdf.TOOLS.mupdf_display_errors(False)
    r = c.execute("SELECT path FROM books WHERE id=?", (bid,)).fetchone()
    if not r: raise RuntimeError("libro no encontrado")
    d = pymupdf.open(r[0]); pg = d[page - 1]
    z = width / pg.rect.width
    pix = pg.get_pixmap(matrix=pymupdf.Matrix(z, z), alpha=False)
    return {"png": base64.b64encode(pix.tobytes("png")).decode(), "w": pix.width, "h": pix.height}


# ---------- biblioteca ZIM (Wikipedia, iFixit, Stack Exchange…) ----------
ZIM_DIR = os.path.join(HOME, "biblioteca")
_zims = {}


def zim_files(d=ZIM_DIR):
    out = []
    for dp, _, fs in os.walk(d):
        for f in fs:
            if f.lower().endswith(".zim"): out.append(os.path.relpath(os.path.join(dp, f), d))
    return sorted(out)


def zim_label(f):
    n = f.lower()
    for k, v in (("ifixit", "iFixit"), ("mechanics.stack", "Mecánica automotriz"), ("philosophy", "Filosofía"), ("internet-encyclopedia", "Filosofía"),
                 ("stackoverflow", "Programación"), ("serverfault", "Programación"), ("superuser", "Programación"), ("askubuntu", "Programación"),
                 ("softwareengineering", "Programación"), ("codereview", "Programación"), ("dba.stack", "Programación"), ("security.stack", "Programación"),
                 ("cs.stack", "Programación"), ("cstheory", "Programación"), ("wikipedia", "Wikipedia"), ("libretexts", "LibreTexts"), ("gutenberg", "Gutenberg"), ("stackexchange", "Stack Exchange"), ("devdocs", "Programación")):
        if k in n: return v
    return f


def _zim(f, d=ZIM_DIR):
    from libzim.reader import Archive
    if f not in _zims: _zims[f] = Archive(os.path.join(d, f))
    return _zims[f]


def html_text(h, limit=2000):
    import html as _h
    h = re.sub(r"(?is)<(script|style|noscript|svg|head)[^>]*>.*?</\1>", " ", h)
    h = re.sub(r"(?i)</(p|div|li|h\d|tr)>|<br\s*/?>", "\n", h)
    h = re.sub(r"(?s)<[^>]+>", " ", h)
    h = _h.unescape(h)
    h = re.sub(r"[ \t\r\f]+", " ", h)
    h = re.sub(r"\s*\n\s*", "\n", h).strip()
    return h[:limit]


def _stems(words):
    return [norm(w)[:4] if len(w) >= 5 else norm(w) for w in words]


_ZIM_LIST = {}            # d -> (momento, lista): recorrer 322 archivos en cada consulta es tiempo perdido
_ZIM_EX = None            # hilos persistentes (crearlos por consulta también cuesta)
ZIM_WORKERS = int(os.environ.get("CAPICHAD_ZIM_WORKERS", "4"))
# Generalistas pesados (≈ 130 GB): se consultan solo si los ZIM ligeros no bastan. El resto (≈ 30 GB: devdocs,
# Stack Exchange técnico, iFixit, mecánica…) va siempre en la primera etapa.
_ZIM_HEAVY = ("wikipedia_", "wikibooks_en", "gutenberg_", "math.stackexchange", "tex.stackexchange", "libretexts.org",
              "mathematica.stackexchange", "blender.stackexchange")
_RAW_MAX = 60_000         # bytes de HTML que se limpian por artículo: el texto útil (2000 car.) sale del principio
try:                      # caché de clusters descomprimidos de libzim (16 por defecto): resultados repetidos salen de RAM
    import libzim
    libzim.set_cluster_cache_max_size(int(os.environ.get("CAPICHAD_ZIM_CACHE", "96")))
except Exception:
    pass


def zim_files_cached(d=ZIM_DIR):
    now = time.time(); h = _ZIM_LIST.get(d)
    if h and now - h[0] < 120: return h[1]
    lst = zim_files(d); _ZIM_LIST[d] = (now, lst)
    return lst


def zim_is_heavy(f):
    n = os.path.basename(f).lower()
    return n.startswith(_ZIM_HEAVY[:3]) or any(k in n for k in _ZIM_HEAVY[3:])


def _zim_pool():
    global _ZIM_EX
    if _ZIM_EX is None:
        from concurrent.futures import ThreadPoolExecutor
        _ZIM_EX = ThreadPoolExecutor(ZIM_WORKERS)
    return _ZIM_EX


def zim_search(q, k=4, d=ZIM_DIR, only=None, staged=True):
    """Busca en los ZIM por etapas: primero los ligeros; los generalistas pesados solo si hay menos de 3 aciertos buenos."""
    from libzim.search import Searcher, Query
    words = [t for t in dict.fromkeys(re.findall(r"\w+", q.lower())) if len(t) > 2 and norm(t) not in STOP][:10]
    if not words: return []
    stems = _stems(words); need = _need(len(words)); nw = len(words)
    steps = [n for n in (nw, 5, 4, 3, 2, 1) if n <= nw]
    steps = list(dict.fromkeys(steps))
    def one(f):
        out = []
        try:
            a = _zim(f, d)
            if not a.has_fulltext_index: return out
            cand = []
            for n in steps:                                    # Xapian exige todas las palabras: se prueba con menos
                r = Searcher(a).search(Query().set_query(" ".join(words[:n])))
                cand = list(r.getResults(0, 4))
                if len(cand) >= 3: break
            for rank, path in enumerate(cand):
                e = a.get_entry_by_path(path)
                if e.is_redirect: e = e.get_redirect_entry()
                it = e.get_item()
                if not it.mimetype.startswith("text/html"): continue
                raw = bytes(it.content)
                i = raw.find(b"<body", 0, 60000)               # salta la cabecera: lo útil empieza en <body>
                txt = html_text(raw[max(i, 0):max(i, 0) + _RAW_MAX].decode("utf-8", "ignore"))
                if len(txt) < 80: continue
                nt = norm(e.title + " " + txt)
                cov = sum(1 for st in stems if st in nt)
                if cov < need: continue
                out.append({"kind": "zim", "zim": f, "zpath": e.path, "title": e.title, "topic": zim_label(f), "text": txt, "rank": rank, "cov": cov, "terms": nw,
                            "score": cov * 10 - rank + (3 if any(st in norm(e.title) for st in stems) else 0)})
                if len(out) >= 3: break                        # un ZIM no aporta más de 3 al resultado final
        except Exception:
            pass
        return out

    def run(files):
        res = list(_zim_pool().map(one, files))
        return [r for lst in res for r in lst]

    files = only if only is not None else zim_files_cached(d)
    if not staged or only is not None:
        out = run(files)
    else:
        light = [f for f in files if not zim_is_heavy(f)]; heavy = [f for f in files if zim_is_heavy(f)]
        out = run(light)
        good = [r for r in out if r["cov"] / max(1, r["terms"]) >= 0.75]
        if len(good) < 3 and heavy: out += run(heavy)
    out.sort(key=lambda r: -r["score"])
    return out[:k]


def zim_article(f, path, d=ZIM_DIR, max_imgs=40):
    """HTML autocontenido de un artículo (sin scripts, con las imágenes incrustadas)."""
    import posixpath, urllib.parse, html as _h
    a = _zim(f, d); e = a.get_entry_by_path(path)
    if e.is_redirect: e = e.get_redirect_entry()
    h = bytes(e.get_item().content).decode("utf-8", "ignore")
    h = re.sub(r"(?is)<script.*?</script>", "", h)
    h = re.sub(r"(?is)<link[^>]*>", "", h)
    base = posixpath.dirname(e.path); n = [0]

    def img(m):
        src = _h.unescape(m.group(2))
        if src.startswith("data:"): return m.group(0)
        if n[0] >= max_imgs: return ""
        p = posixpath.normpath(posixpath.join(base, urllib.parse.unquote(src.split("#")[0].split("?")[0])))
        try:
            it = a.get_entry_by_path(p).get_item()
            b = bytes(it.content)
            if len(b) > 700_000: return ""
            n[0] += 1
            return m.group(1) + '"data:' + it.mimetype + ';base64,' + base64.b64encode(b).decode() + '"'
        except Exception:
            return ""
    h = re.sub(r'(?is)(<img[^>]*?\ssrc=)"([^"]*)"', img, h)
    css = "<style>body{font-family:Segoe UI,Arial,sans-serif;max-width:860px;margin:16px auto;padding:0 14px;color:#1b2430;line-height:1.5}img{max-width:100%;height:auto}</style>"
    return {"title": e.title, "html": css + h, "imgs": n[0]}


_CACHE = {}               # consulta -> resultados; la biblioteca no cambia mientras corre el servidor
_CACHE_MAX = 300


def search_all(c, q, k=6, topic=None):
    key = (" ".join(norm(q).split()), k, topic)
    hit = _CACHE.get(key)
    if hit is not None: return hit
    out = _search_all(c, q, k, topic)
    if len(_CACHE) >= _CACHE_MAX: _CACHE.pop(next(iter(_CACHE)))
    _CACHE[key] = out
    return out


def _search_all(c, q, k=6, topic=None):
    books = search(c, q, k, topic)
    for b in books: b["kind"] = "pdf"
    z = zim_search(q, 4)
    allr = books + z
    if not allr: return []
    for r in allr: r["ratio"] = r.get("cov", 1) / max(1, r.get("terms", 1))
    best = max(r["ratio"] for r in allr)
    allr = [r for r in allr if r["ratio"] >= max(0.4, best - 0.25)]      # descarta lo claramente menos relevante
    books = [r for r in allr if r["kind"] == "pdf"]; z = [r for r in allr if r["kind"] == "zim"]
    out = []
    for i in range(max(len(books), len(z))):      # intercala libros y artículos ya filtrados
        if i < len(z): out.append(z[i])
        if i < len(books): out.append(books[i])
    return out[:k + 3]


def zim_thumbs(f, path, d=ZIM_DIR, n=3, min_bytes=6000):
    """Primeras imágenes con contenido de un artículo (data URI), para mostrarlas en el chat."""
    import posixpath, urllib.parse, html as _h
    a = _zim(f, d); e = a.get_entry_by_path(path)
    if e.is_redirect: e = e.get_redirect_entry()
    h = bytes(e.get_item().content).decode("utf-8", "ignore")
    base = posixpath.dirname(e.path); out = []
    for m in re.finditer(r'<img[^>]*?\ssrc="([^"]*)"', h, re.I):
        src = _h.unescape(m.group(1))
        if src.startswith("data:"): continue
        p = posixpath.normpath(posixpath.join(base, urllib.parse.unquote(src.split("#")[0].split("?")[0])))
        try:
            it = a.get_entry_by_path(p).get_item(); b = bytes(it.content)
            if min_bytes < len(b) < 400_000 and it.mimetype.startswith("image/"):
                out.append("data:" + it.mimetype + ";base64," + base64.b64encode(b).decode())
                if len(out) >= n: break
        except Exception:
            continue
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd"); ap.add_argument("a", nargs="*")
    ap.add_argument("--db", default=DB_DEFAULT); ap.add_argument("-k", type=int, default=8); ap.add_argument("--w", type=int, default=900)
    ap.add_argument("--topic", default=None, help="ingest: etiqueta de tema para todo lo que se indexe")
    ap.add_argument("--workers", type=int, default=4, help="ocr: procesos de Tesseract en paralelo")
    ap.add_argument("--maxbooks", type=int, default=None, help="ocr: procesar solo los N libros mas cortos")
    ar = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    if ar.cmd == "ingest":
        print(json.dumps(ingest(ar.a[0], ar.db, log=lambda s: print(s, flush=True), topic_name=ar.topic), ensure_ascii=False))
    elif ar.cmd == "ocr":      # capichad_kb.py ocr [--workers 4] [--maxbooks N]
        print(json.dumps(ocr_books(ar.db, workers=max(1, min(ar.workers, 8)), limit_books=ar.maxbooks,
                                   log=lambda s: print(s, flush=True)), ensure_ascii=False))
    elif ar.cmd == "rescan":   # capichad_kb.py rescan  -> marca escaneos con encabezado; luego `ocr`
        print(json.dumps(rescan_ocr(ar.db, log=lambda s: print(s, flush=True)), ensure_ascii=False))
    elif ar.cmd == "zimcheck":   # lee por stdin una lista JSON de rutas .zim
        print(json.dumps(zim_check(json.loads(sys.stdin.read() or "[]")), ensure_ascii=False))
    elif ar.cmd == "optimize":   # compacta el índice FTS5 y refresca estadísticas
        c = connect(ar.db); t0 = time.time()
        c.execute("INSERT INTO fts(fts) VALUES('optimize')"); c.execute("ANALYZE"); c.commit()
        c.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        print(json.dumps({"optimizado_s": round(time.time() - t0)}))
    elif ar.cmd == "search":
        print(json.dumps(search(connect(ar.db), " ".join(ar.a), ar.k), ensure_ascii=False))
    elif ar.cmd == "searchall":
        print(json.dumps(search_all(connect(ar.db), " ".join(ar.a), ar.k), ensure_ascii=False))
    elif ar.cmd == "page":
        print(json.dumps(render_page(connect(ar.db), int(ar.a[0]), int(ar.a[1]), ar.w)))
    elif ar.cmd == "status":
        print(json.dumps(status_info(connect(ar.db)), ensure_ascii=False, indent=1))
    elif ar.cmd == "serve":
        c = connect(ar.db)
        import threading
        def _warm():          # abre los ZIM y toca el índice de cada uno antes de la primera pregunta real
            try:
                for f in zim_files_cached(): _zim(f)
                search(connect(ar.db), "python function", 1)
                zim_search("python function", 1, staged=False)
            except Exception:
                pass
        threading.Thread(target=_warm, daemon=True).start()
        for line in sys.stdin:
            try:
                m = json.loads(line); op = m["op"]
                if op == "search": r = search(c, m["q"], m.get("k", 8), m.get("topic"))
                elif op == "thumbs": r = zim_thumbs(m["zim"], m["path"], n=m.get("n", 3))
                elif op == "zim": r = zim_article(m["zim"], m["path"])
                elif op == "searchall": r = search_all(c, m["q"], m.get("k", 6), m.get("topic"))
                elif op == "page": r = render_page(c, m["book"], m["page"], m.get("w", 900))
                elif op == "status": r = status_info(c)
                else: raise RuntimeError("op desconocida")
                print(json.dumps({"id": m.get("id"), "ok": r}, ensure_ascii=False), flush=True)
            except Exception as e:
                print(json.dumps({"id": (m or {}).get("id") if 'm' in dir() else None, "error": str(e)}), flush=True)


if __name__ == "__main__":
    main()
