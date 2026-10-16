"""One-off: kitab table of contents of the four Sunan from al-Maktaba al-Shamela -> pipeline/toc/<book>.json

For each book the Shamela table of contents gives the numbered kitabs and the page each
starts on; the first hadith number printed after that page marks where the kitab begins.
The edition is the one whose numbering the Ifta data follows. Pages are cached under
data/raw/shamela/ and fetched slowly.
Rows are [first mainId in the Ifta data, first hadith number, kitab title].
"""
import html
import json
import re
import sys
import time
import urllib.request
from bisect import bisect_left
from pathlib import Path

from common import RAW, dump

TOC = Path(__file__).resolve().parent / "toc"
CACHE = RAW / "shamela"
TEXT_MATCH = {"nasai"}
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0 Safari/537.36"
ARABIC_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")
DIACRITICS = re.compile(r"[ً-ْٰـ]")

# book key -> (Ifta file slug, Shamela book id, edition)
BOOKS = {
    "abudawud": ("sunan-abi-dawud", 1726, "تحقيق محمد محيي الدين عبد الحميد"),
    "tirmidhi": ("jami-al-tirmidhi", 1435, "تحقيق أحمد شاكر وآخرين"),
    "nasai": ("sunan-al-nasai", 829, "الطبعة المصرية (مع حاشية السندي)"),
    "ibnmajah": ("sunan-ibn-majah", 1198, "تحقيق محمد فؤاد عبد الباقي"),
}


def fetch(book_id, page=None):
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / f"{book_id}_{page or 'toc'}.html"
    if not path.exists():
        url = f"https://shamela.ws/book/{book_id}" + (f"/{page}" if page else "")
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        for attempt in range(5):
            try:
                with urllib.request.urlopen(req, timeout=40) as r:
                    path.write_bytes(r.read())
                break
            except OSError as e:                 # timeouts and resets: back off and retry
                if attempt == 4:
                    raise
                print(f"  retry {url} ({e})", flush=True)
                time.sleep(5 * (attempt + 1))
        time.sleep(0.8)
    return path.read_text(encoding="utf-8")


def page_text(s):
    i, j = s.find("bu_load_prev"), s.find("bu_load_next")
    t = re.sub(r"<[^>]+>", " ", s[i:j] if j > i else s[i:i + 8000])
    return re.sub(r"\s+", " ", html.unescape(t))


def kitabs(book_id):
    """Top-level numbered entries of the table of contents: (page, title)."""
    s = fetch(book_id)
    out = []
    for page, title in re.findall(rf'<a href="https://shamela.ws/book/{book_id}/(\d+)(?:#[^"]*)?"[^>]*>([^<]+)</a>', s):
        title = html.unescape(title).strip()
        # "١ - كتاب الطهارة" or "[١] كتاب الطهارة"; a few kitabs are listed without a number
        m = re.match(r"^(?:[٠-٩\d]+\s*-|\[[٠-٩\d]+\])\s*(.+)$", title) or re.match(r"^(كتاب\s*:?.+)$", title)
        if m:
            clean = DIACRITICS.sub("", m.group(1)).replace("كتاب:", "كتاب").strip(" .")
            out.append((int(page), re.sub(r"\s+", " ", clean)))
    return out


def first_hadith(book_id, page, lookahead=12):
    """(number, opening words) of the first hadith printed from this page on."""
    for p in range(page, page + lookahead):
        # a heading "٢ - كتاب الصلاة" carries the kitab's ordinal, not a hadith number
        text = DIACRITICS.sub("", page_text(fetch(book_id, p)))
        m = re.search(r"(?:^|\s)([٠-٩]+)\s*-\s*(?!\s*(?:كتاب|أبواب|ابواب|باب|جماع|تفريع))", text)
        if m:
            return int(m.group(1).translate(ARABIC_DIGITS)), text[m.end():m.end() + 400]
    return None, ""


def words(text):
    return set(re.sub(r"[^\u0621-\u064A\s]", " ", DIACRITICS.sub("", text)).split())


def match_by_text(opening, records, near, window=40):
    """Record whose text best overlaps the printed opening, among those numbered near `near`."""
    want = words(opening)
    best, best_score = None, 0.0
    for num, rec in records:
        if abs(num - near) > window:
            continue
        have = words(rec["hadith_text"][:600])
        score = len(want & have) / (len(want) or 1)
        if score > best_score:
            best, best_score = rec, score
    return best if best_score >= 0.5 else None


def main(only=None):
    for key, (slug, book_id, edition) in BOOKS.items():
        if only and key not in only:
            continue
        records = json.load(open(RAW / "ifta" / "original" / f"{slug}.json", encoding="utf-8"))
        numbered = sorted((int(h["hadith_num"]), h["mainId"]) for h in records if h["hadith_num"].isdigit())
        nums = [n for n, _ in numbered]
        by_num = [(int(h["hadith_num"]), h) for h in records if h["hadith_num"].isdigit()]
        rows = []
        for page, title in kitabs(book_id):
            n, opening = first_hadith(book_id, page)
            if n is None:
                print(f"  ! {key}: no hadith number after page {page} ({title})")
                continue
            if key in TEXT_MATCH:              # the edition's numbering drifts from the program's
                rec = match_by_text(opening, by_num, n)
                if rec:
                    rows.append([rec["mainId"], int(rec["hadith_num"]), title])
                else:
                    print(f"  ! {key}: no text match for {title} (printed number {n})")
                continue
            i = bisect_left(nums, n)            # first Ifta record numbered n (or the next one present)
            if i < len(numbered):
                rows.append([numbered[i][1], n, title])
        rows.sort()
        if rows and rows[0][1] > 1:            # unnumbered opening section (e.g. Ibn Majah's muqaddima)
            rows.insert(0, [numbered[0][1], numbered[0][0], "المقدمة"])
        dump(rows, TOC / f"{key}.json", pretty=True)
        print(f"{key} ({edition}): {len(rows)} kitabs:", " | ".join(f"{n} {t}" for _, n, t in rows))


if __name__ == "__main__":
    main(set(sys.argv[1:]) or None)
