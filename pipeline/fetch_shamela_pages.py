"""Download whole books from al-Maktaba al-Shamela, page by page, as plain text
-> data/raw/shamela/pages/<book id>.jsonl, one {"id", "num", "body", "hamesh"} per page.

`body` is the page text and `hamesh` its footnotes (the editors' notes, where the Shamela editions
keep e.g. "[حكم الألباني]" and the muhaqqiq's verdicts). Pages follow the site's own "next page"
links. Fetching is slow on purpose and resumes where it stopped.

    python3 fetch_shamela_pages.py 1726 1147 ...
"""
import html
import json
import re
import sys
import time
import urllib.request

from common import RAW

OUT = RAW / "shamela" / "pages"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0 Safari/537.36"
DELAY = 1.0


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.read().decode("utf-8")
        except OSError as e:                     # timeouts and resets: back off and retry
            if attempt == 5:
                raise
            print(f"  retry {url} ({e})", flush=True)
            time.sleep(10 * (attempt + 1))


def plain(fragment):
    t = re.sub(r"<br\s*/?>|</p>", "\n", fragment)
    t = html.unescape(re.sub(r"<[^>]+>", "", t))
    return "\n".join(re.sub(r"[ \t ]+", " ", line).strip() for line in t.split("\n")).strip()


def parse(s):
    """(page id, printed page number, body, hamesh, next page id) of one page."""
    m = re.search(r'<div class="nass[^"]*" data-page-id="(\d+)" data-page-num="([^"]*)">(.*?)</div>\s*<div id="appended_pages"',
                  s, re.S)
    if not m:
        raise ValueError("page layout not recognised")
    inner = m.group(3)
    body, _, hamesh = inner.partition('<p class="hamesh">')
    body = re.sub(r'<a href="#p\d+" class="btn_tag[^>]*>.*?</a>', "", body)
    nxt = re.search(r'bu_load_next" data-next-id="(\d*)"', s)
    return int(m.group(1)), m.group(2), plain(body), plain(hamesh), (nxt.group(1) if nxt else "")


def crawl(book_id):
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{book_id}.jsonl"
    last = None
    if path.exists():
        lines = path.read_text(encoding="utf-8").splitlines()
        if lines:
            last = json.loads(lines[-1])
            if last.get("end"):
                print(f"{book_id}: complete ({len(lines) - 1} pages)")
                return
    page = last["next"] if last else "1"
    n = 0
    with open(path, "a", encoding="utf-8") as f:
        while page:
            pid, num, body, hamesh, nxt = parse(get(f"https://shamela.ws/book/{book_id}/{page}"))
            f.write(json.dumps({"id": pid, "num": num, "body": body, "hamesh": hamesh, "next": nxt},
                               ensure_ascii=False) + "\n")
            f.flush()
            n += 1
            if n % 200 == 0:
                print(f"{book_id}: page {pid}", flush=True)
            page = nxt
            time.sleep(DELAY)
        f.write(json.dumps({"end": True}) + "\n")
    print(f"{book_id}: done", flush=True)


if __name__ == "__main__":
    for b in sys.argv[1:]:
        crawl(int(b))
