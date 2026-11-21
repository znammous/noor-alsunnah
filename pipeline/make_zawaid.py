"""Zawa'id over the nine books: the hadiths of a further book that the program's takhrij does not
place in any of the nine books (from the same companion) -> site/data/z/<book>.json

Only marfu' (and qudsi) hadiths for now. For each one the page keeps the program's text and chains,
the other books the program lists for it, and the muhaqqiq's verdict quoted from his footnote.

Two steps:
  python3 make_zawaid.py --shamela   read the verdicts from the offline Shamela dump
                                     (pipeline/shamela_offline, book <id>.jsonl + its page db)
                                     -> pipeline/zawaid/<book>.json (kept in git)
  python3 make_zawaid.py             build the site data from the program's data and that file

The muhaqqiq's verdict is the footnote whose marker closes the hadith (the last marker before the
«[x: y]» of al-Taqasim or the next heading/hadith). Footnotes of a printed page can sit on a later
Shamela page of the same printed page, so all of them are searched.
"""
import json
import re
import sqlite3
import sys
from collections import Counter, defaultdict
from pathlib import Path

from build_site import CHAIN_ORDER, chain_class, first_year, grade_of, light, tabaqa_of
from common import RAW, SITE_DATA, dump, load, strip_diacritics
from ifta_load import clean, hadith_type, locate, read, read_book, split_notes

HERE = Path(__file__).resolve().parent
OUT = HERE / "zawaid"
SHAMELA = RAW / "shamela" / "offline"
NINE = set(range(1, 10))
# book key -> (Ifta slug, program book id, Shamela book id, compiler names at the end of chains)
BOOKS = {
    "ibnhibban": ("sahih-ibn-hibban", 10, 1729, {"ابن حبان"}),
}
AR = str.maketrans("0123456789", "٠١٢٣٤٥٦٧٨٩")


# ---------- step 1: the muhaqqiq's footnotes from the offline Shamela dump ----------
def shamela_clean(s):
    s = (s or "").replace("¬", "").replace("\r", "\n")
    return re.sub(r"<[^>]+>", "", s)


MARK = re.compile(r'[(\"]([٠-٩]+)[)\"]|(?<=[\"».\s!؟])([٠-٩])(?=[.\s\[]|$)|(?<=[^\s٠-٩(\"])([٠-٩])(?=[.\s\[]|$)')
TAQASIM = re.compile(r"\[[٠-٩]+\s*:\s*[٠-٩]+\]|\n\s*ذِ?كْ?رُ? ")


def footnotes(shamela_id, wanted=None):
    """hadith number -> {page, vp, note} for the numbered hadiths of the book (or those `wanted`)."""
    pages = {}
    for line in open(SHAMELA / "books" / f"{shamela_id}.jsonl", encoding="utf-8"):
        d = json.loads(line)
        pages[d["page"]] = {"body": shamela_clean(d["body"]), "foot": shamela_clean(d["foot"])}
    db = sqlite3.connect(SHAMELA / "database" / "book" / f"{shamela_id % 1000:03d}" / f"{shamela_id}.db")
    vp = {i: (part, page) for i, part, page in db.execute("select id, part, page from page")}
    start = {}
    for i, n in db.execute("select id, number from page where number is not null order by id"):
        start.setdefault(n, i)
    marked_set = set(start)
    ids = sorted(pages)
    pos = {p: k for k, p in enumerate(ids)}
    by_print = defaultdict(list)
    for p in ids:
        by_print[vp.get(p)].append(p)

    def head(n):
        return re.compile(r"(?m)^\s*\[?" + str(n).translate(AR) + r"\]?\s*[-ـ–]")

    # numbers the page db does not mark: look for them after the nearest marked number before them
    marked = sorted(start)
    for n in wanted or ():
        if n not in start:
            before = [x for x in marked if x < n]
            if before:
                start[n] = start[before[-1]]
    out = {}
    for n, first in start.items():
        if (wanted and n not in wanted) or first not in pos:
            continue
        k, m = pos[first], None
        for k in range(pos[first], min(pos[first] + (3 if n in marked_set else 25), len(ids))):
            m = head(n).search(pages[ids[k]]["body"])
            if m:
                break
        if not m:                       # the page is known but its text is garbled: no footnote
            out[n] = {"page": first, "vp": "/".join(map(str, vp.get(first, ("", "")))), "note": ""}
            continue
        seg, off, nxt = [], m.end(), head(n + 1)
        while k < len(ids) and len(seg) < 6:
            body = pages[ids[k]]["body"][off:]
            e = nxt.search(body)
            cut = body[:e.start()] if e else body
            t = TAQASIM.search(cut)
            if t:
                cut = cut[:t.start()]
            seg.append((ids[k], cut))
            if e or t:
                break
            k, off = k + 1, 0
        # every footnote the hadith points to; the verdict is the last one that states one,
        # else the last that is not a note on the wording («في الأصل: ...»), else the last
        found = []
        for p, txt in seg:
            for mm in MARK.finditer(txt):
                num = next(g for g in mm.groups() if g)
                foot = "\n".join(pages[q]["foot"] for q in by_print[vp.get(p)] if pages[q]["foot"])
                f = re.search(r'(?m)^\s*[(\"]?' + num + r'[)\"]?\s*-?\s*(.*?)(?=^\s*[(\"]?[٠-٩]+[)\"]?\s*-?\s*\D|\Z)', foot, re.S)
                if f:
                    found.append(re.sub(r"[ \t]+", " ", f.group(1)).strip())
        page = next((p for p, _ in seg), first)
        rec = {"page": page, "vp": "/".join(map(str, vp.get(page, ("", "")))), "note": ""}
        textual = lambda t: re.match(r"(في (حاشية )?الأصل|في نسخة|انظر|تحرف|سقط|لفظ|كذا|زيادة|ما بين)", strip_diacritics(t))
        pick = [t for t in found if verdict(t)] or [t for t in found if not textual(t)]
        if pick:
            rec["note"] = pick[-1]
        out[n] = rec
    return out


def kitabs(shamela_id):
    """[(first page, kitab title)] from the top level of the book's table of contents."""
    titles = {}
    for line in open(SHAMELA / "books" / f"{shamela_id}.jsonl", encoding="utf-8"):
        d = json.loads(line)
        for m in re.finditer(r"<span data-type='title' id=toc-(\d+)>(.*?)</span>", d["body"]):
            titles[int(m.group(1))] = re.sub(r"\s+", " ", strip_diacritics(re.sub(r"<[^>]+>", "", m.group(2)))).strip()
    db = sqlite3.connect(SHAMELA / "database" / "book" / f"{shamela_id % 1000:03d}" / f"{shamela_id}.db")
    return [(page, titles.get(i, "")) for i, page, parent in db.execute("select id, page, parent from title order by id")
            if parent == 0 and titles.get(i, "").strip() and titles.get(i) != "مقدمات"]


def extract(book):
    slug, book_id, shamela_id, _ = BOOKS[book]
    # only the numbers that the program places in none of the nine books are kept
    takh = defaultdict(list)
    for rec in read_book(slug)[0]:
        if rec["hadith_num"].strip().isdigit():
            takh[int(rec["hadith_num"])] += [b for b, _, _ in rec["takhreej"]]
    wanted = {n for n, bs in takh.items() if not NINE & set(bs)}
    notes = footnotes(shamela_id, wanted)
    dump({"shamela": shamela_id, "kitabs": kitabs(shamela_id),
          "notes": {str(n): r for n, r in sorted(notes.items())}}, OUT / f"{book}.json", pretty=True)
    print(f"{book}: {len(notes)} numbered hadiths, {sum(1 for r in notes.values() if r['note'])} with a footnote")


# ---------- step 2: site data ----------
def verdict(note):
    """The verdict as the footnote opens it («إسناده صحيح على شرط مسلم»), or "" when it opens otherwise."""
    first = re.split(r"[،,.]", note or "", maxsplit=1)[0].strip()
    plain = strip_diacritics(first)
    # it must open with the verdict itself: «إسناده ...»، «حديث ...»، «صحيح لغيره»; «رجاله ثقات» describes the men only
    opens = re.match(r"(إسناده?|سنده|حديث|صحيح|حسن|ضعيف|موضوع|منكر|باطل|شاذ)(\s|$)", plain)
    return first if opens and len(first) < 90 and re.search(r"صحيح|حسن|ضعيف|موضوع|منكر|باطل|شاذ|قوي|جيد", plain) else ""


def build(book):
    slug, book_id, shamela_id, compiler_names = BOOKS[book]
    G = load(OUT / f"{book}.json")
    meta = load(SITE_DATA / "meta.json")
    on_site = set(meta["directory"])
    original, graph = read_book(slug)
    graph = {h["mainId"]: h for h in graph}
    narrators = {n["narrator_id"]: n for n in read(RAW / "ifta" / "original" / "ifta_narrators.json")}
    by_name = defaultdict(list)
    for n in narrators.values():
        by_name[n["display_name"].strip()].append(n["narrator_id"])
    kitab_pages = [p for p, _ in G["kitabs"]]

    # one hadith = one number; unnumbered records with an isnad join the hadith before them in the same bab
    by_num, order, current = {}, [], None
    for rec in original:
        num = rec["hadith_num"].strip()
        if num.isdigit():
            if num not in by_num:
                by_num[num] = {"num": num, "bab": rec["chapter"].strip(), "recs": []}
                order.append(num)
            current = by_num[num]
        elif not (current and rec["chain_of_narrators"] and rec["chapter"].strip() == current["bab"]):
            continue
        current["recs"].append(rec)

    out, narr_ids = [], set()
    for num in order:
        h = by_num[num]
        recs = h["recs"]
        takh = [t for r in recs for t in r["takhreej"]]
        if any(b in NINE for b, _, _ in takh):
            continue
        typ = hadith_type(recs[0]["features"])
        if typ not in ("مرفوع", "قدسي"):
            continue
        parts, chains = [], []
        for rec in recs:
            text, ed_notes = split_notes(clean(rec["hadith_text_diac"]))
            # Ibn Hibban's records open with the heading of the hadith («ذِكْرُ ...») and its number
            lead = re.search(r"(?:^|\s)" + num + r"\s*[-–]\s*", text[:1500])
            if lead:
                text = text[lead.end():]
            matn = clean(rec.get("matn_text_diac"))
            part = {"text": text, "mentions": [], "matn": None}
            if ed_notes:
                part["notes"] = ed_notes
            pos = 0
            for surface, diac, nid in rec.get("names") or []:
                i = locate(text, diac, pos)
                if i >= 0:
                    part["mentions"].append([i, i + len(diac.strip()), str(nid)])
                    pos = i + len(diac.strip())
            m = locate(text, matn)
            if m >= 0:
                part["matn"] = [m, m + len(matn)]
            parts.append(part)
            g = graph.get(rec["mainId"])
            # chains come ID-linked from the graph export; else from the names, when a name is unique
            src = [[(str(i), n) for i, n in c] for c in g["chain_of_narrators"]] if g else \
                [[((str(by_name[n][0]) if len(by_name.get(n, [])) == 1 else f"u:{n}"), n) for n in c] for c in rec["chain_of_narrators"]]
            for ids in src:
                if ids and ids[-1][1].strip() in compiler_names:
                    ids = ids[:-1]
                if ids:
                    chains.append([i for i, _ in ids])
        for p in parts:
            narr_ids.update(m[2] for m in p["mentions"])
        for c in chains:
            narr_ids.update(c)
        # the other books, as the program names them, and Ibn Hibban's own repeats
        books, repeats = defaultdict(set), set()
        for b, name, main in takh:
            if b == book_id:
                repeats.add(main)
                continue
            books[re.sub(r"\s+في\s+.*$", "", re.sub(r"^\(كتب أخرى\)", "", name or "")).strip() or str(b)].add(main)
        note = G["notes"].get(num, {})
        k = max(0, sum(1 for p in kitab_pages if p <= note.get("page", 0)) - 1)
        shawahid = sorted({(n or "").strip() for r in recs for n, _, _ in r["shawahed"]} - {""})
        out.append({
            "n": num, "kitab": k + 1, "bab": h["bab"], "type": typ, "parts": parts, "chains": chains,
            "takhrij": sorted(([b, len(ids)] for b, ids in books.items()), key=lambda r: -r[1]),
            "shawahid": shawahid,
            "grade": {"v": verdict(note.get("note")), "note": note.get("note", ""), "page": note.get("page"), "vp": note.get("vp", "")},
        })

    # narrators, graded as on the rest of the site; those absent from the nine books get no link
    narr = {}
    for nid in narr_ids:
        v = narrators.get(int(nid)) if nid.isdigit() else None
        if not v:
            narr[nid] = {"name": nid[2:] if nid.startswith("u:") else nid, "cls": "unknown", "out": 1}
            continue
        tab = tabaqa_of(v.get("class_of_narrators"))
        rank = (v.get("rank_by_ibn_hajar") or "").strip()
        n = {"name": v["display_name"].strip(), "rank": rank, "tabaka": tab, "death": v.get("date_of_death"),
             "cls": grade_of(rank, tab, v["display_name"]),
             "tadlis": 1 if re.search(r"دلس|تدليس|مدلس", rank) else 0,
             "ikhtilat": 1 if re.search(r"اختلط|تغير", rank) else 0}
        narr[nid] = light(n)
        if nid not in on_site:
            narr[nid]["out"] = 1
    for h in out:
        h["chains"] = [{"ids": c, "c": chain_class(c, narr)} for c in h["chains"]]

    used_kitabs = Counter(h["kitab"] for h in out)
    dump({"book": book, "shamela": shamela_id,
          "kitabs": [[i + 1, t, used_kitabs[i + 1]] for i, (_, t) in enumerate(G["kitabs"]) if used_kitabs[i + 1]],
          "hadiths": out, "nar": narr}, SITE_DATA / "z" / f"{book}.json")
    index_path = SITE_DATA / "z" / "index.json"
    index = load(index_path) if index_path.exists() else {}
    index[book] = len(out)
    dump(index, index_path)
    graded = Counter("v" if h["grade"]["v"] else ("note" if h["grade"]["note"] else "none") for h in out)
    print(f"{book}: {len(out)} zawa'id (marfu'), verdicts {dict(graded)}, {len(narr)} narrators "
          f"({sum(1 for n in narr.values() if n.get('out'))} not in the nine books)")


if __name__ == "__main__":
    for b in BOOKS:
        if "--shamela" in sys.argv:
            extract(b)
        build(b)
