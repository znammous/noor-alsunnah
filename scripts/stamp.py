"""Stamp a content version onto the site's own files, so a publish is never hidden by the browser cache.

GitHub Pages serves everything with max-age=600; without a changing URL a visitor can run new pages
against old code or data for ten minutes. The version is a hash of every file under site/ except the
HTML pages themselves; it goes on style/script/link URLs and, via window.V, on every data fetch.
"""
import hashlib
import re
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent / "site"

h = hashlib.sha1()
for p in sorted(SITE.rglob("*")):
    if p.is_file() and p.suffix != ".html":
        h.update(str(p.relative_to(SITE)).encode())
        h.update(p.read_bytes())
v = h.hexdigest()[:10]

ASSET = re.compile(r'((?:href|src)="|")(style\.css|landing\.css|app\.js|app\.html|data/stats\.json)(\?v=\w+)?')
for name in ("app.html", "index.html"):
    page = SITE / name
    text = ASSET.sub(lambda m: f"{m[1]}{m[2]}?v={v}", page.read_text(encoding="utf-8"))
    text = re.sub(r'window\.V = "\w*"', f'window.V = "{v}"', text)
    page.write_text(text, encoding="utf-8")
print(v)
