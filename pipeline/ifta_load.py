"""Sahihayn from the Jami' Khadim al-Haramayn program -> data/work/corpus.json

Source: برنامج جامع خادم الحرمين الشريفين للسنة النبوية (sunna.alifta.gov.sa), General
Presidency of Scholarly Research and Ifta, via the structured export by Jehad Oumer
(Kaggle: jehadoumer/ifta-hadith-corpus-original + ifta-hadith-isnad-linked-graph-data).

* One hadith = one customary number (Fath al-Bari for Bukhari, Abd al-Baqi for Muslim);
  the platform splits Muslim's numbers into several records, which are merged here.
  Unnumbered records carrying an isnad (e.g. قال الفربري ...) join the preceding hadith.
* Chains come ID-linked from the graph export; records missing there fall back to the
  name chains of the original export, resolved by unique display name.
* Kitabs come from pipeline/toc (see make_toc.py).
"""
import json
import re
from bisect import bisect_right
from collections import defaultdict
from pathlib import Path

from common import RAW, WORK, dump, strip_diacritics

SRC = RAW / "ifta"
TOC = Path(__file__).resolve().parent / "toc"
BOOKS = {"bukhari": ("sahih-al-bukhari", 1, "البخاري"), "muslim": ("sahih-muslim", 2, "مسلم")}
BOOK_IDS = {v[1]: k for k, v in BOOKS.items()}


def read(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def clean(text):
    text = re.sub(r"\[\d+/\d+\]", " ", text or "")       # print page markers
    text = re.sub(r"^\s*[\d٠-٩]+\s*-\s*", "", text.strip())  # leading hadith number
    return re.sub(r"\s+", " ", text).strip()


def locate(text, needle, start=0):
    """Offset of needle in text, tolerant to spacing differences."""
    needle = re.sub(r"\s+", " ", needle or "").strip()
    if not needle:
        return -1
    i = text.find(needle, start)
    return i


def hadith_type(features):
    for t in ("قدسي", "مرفوع", "موقوف", "مقطوع"):
        if t in (features or {}):
            return t
    return ""


class DSU:
    def __init__(self):
        self.p = {}

    def find(self, x):
        self.p.setdefault(x, x)
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]
            x = self.p[x]
        return x

    def union(self, a, b):
        self.p[self.find(a)] = self.find(b)


def main():
    narrators_src = read(SRC / "original" / "ifta_narrators.json")
    by_name = defaultdict(list)
    for n in narrators_src:
        by_name[n["display_name"].strip()].append(n["narrator_id"])

    hadiths, main_to_key, by_key = [], {}, {}
    compilers = {}
    for book, (slug, book_id, compiler_name) in BOOKS.items():
        original = read(SRC / "original" / f"{slug}.json")
        graph = {h["mainId"]: h for h in read(SRC / "graph" / f"{slug}.json")}
        toc = read(TOC / f"{book}.json")
        toc_main = [r[0] for r in toc]
        current = None
        for rec in original:
            num = rec["hadith_num"].strip()
            g = graph.get(rec["mainId"])
            if g:
                chains = [[(int(i), n) for i, n in c] for c in g["chain_of_narrators"]]
            else:
                chains = []
                for c in rec["chain_of_narrators"]:
                    chains.append([((by_name[n][0] if len(by_name.get(n, [])) == 1 else f"u:{n}"), n) for n in c])
            if not num and not chains:
                continue                                  # tarjamat al-bab without an isnad
            if num:
                key = f"{book[0]}{num}"
                if key not in by_key:          # Muslim repeats a number in more than one place
                    k = bisect_right(toc_main, rec["mainId"]) - 1
                    by_key[key] = {
                        "key": key, "book": book, "num": num, "aliases": [],
                        "kitab_no": k + 1, "kitab": toc[max(k, 0)][2], "bab": rec["chapter"].strip(),
                        "type": hadith_type(rec["features"]), "parts": [], "chains": [],
                        "main_ids": [], "takhreej": [], "shawahed": [], "comparisons": [],
                    }
                    hadiths.append(by_key[key])
                current = by_key[key]
            if current is None:
                continue
            # consecutive hadiths sharing one record: "299 - ... 300 - ... 301 - ..."
            for extra in re.findall(r"(?:^|\s)(\d{1,4})\s*-\s", strip_diacritics(rec["hadith_text"])):
                if num and int(extra) > int(num) and extra not in current["aliases"]:
                    current["aliases"].append(extra)
            text = clean(rec["hadith_text_diac"])
            matn = clean(rec.get("matn_text_diac"))
            part = {"text": text, "mentions": [], "matn": None}
            pos = 0
            for surface, diac, nid in rec.get("names") or []:
                i = locate(text, diac, pos)
                if i >= 0:
                    part["mentions"].append([i, i + len(diac.strip()), int(nid)])
                    pos = i + len(diac.strip())
            m = locate(text, matn)
            if m >= 0:
                part["matn"] = [m, m + len(matn)]
            current["parts"].append(part)
            current["main_ids"].append(rec["mainId"])
            main_to_key[rec["mainId"]] = current["key"]
            for c in chains:
                if c and c[-1][1].strip() == compiler_name:
                    compilers[book] = c[-1][0]
                    c = c[:-1]
                current["chains"].append([i for i, _ in c])
            current["takhreej"] += [[t.get("bookId"), t.get("book_name"), t.get("mainId")] for t in rec.get("takhreej") or []]
            current["shawahed"] += [[s.get("rawy_name"), s.get("bookId"), s.get("mainId")] for s in rec.get("shawahed") or []]
            current["comparisons"] += [[c.get("comparison_type"), c.get("bookId"), c.get("mainId")] for c in rec.get("comparisons") or []]

    # Each hadith keeps exactly the parallels the program lists for it (no chaining: if A lists B
    # and B lists C, A is not tied to C). Connected components are only a storage unit, so that a
    # hadith and everything it links to land in the same site shard.
    dsu = DSU()
    for h in hadiths:
        dsu.find(h["key"])
        rel = []
        for book_id, _, main_id in h["takhreej"]:
            other = main_to_key.get(main_id) if book_id in BOOK_IDS else None
            if other and other != h["key"] and other not in rel:
                rel.append(other)
                dsu.union(h["key"], other)
        h["rel"] = rel

        # spread of this hadith across the program's books, and its shawahid companions
        books = defaultdict(set)
        for book_id, name, main_id in h["takhreej"]:
            books[re.sub(r"\s+في\s+.*$", "", name or "").strip() or str(book_id)].add(main_id)
        h["spread"] = {"books": sorted(([b, len(ids)] for b, ids in books.items()), key=lambda r: -r[1]),
                       "n_hadith": sum(len(ids) for ids in books.values()),
                       "shawahid": sorted({(n or "").strip() for n, _, _ in h["shawahed"]} - {""})}
    for h in hadiths:
        h["group"] = dsu.find(h["key"])

    used = {i for h in hadiths for c in h["chains"] for i in c} | {m[2] for h in hadiths for p in h["parts"] for m in p["mentions"]}
    narrators = {n["narrator_id"]: n for n in narrators_src if n["narrator_id"] in used}
    for h in hadiths:
        for f in ("takhreej", "shawahed", "comparisons"):
            h[f"n_{f}"] = len(h.pop(f))

    dump({"hadiths": hadiths, "narrators": narrators, "compilers": compilers}, WORK / "corpus.json")
    unresolved = sum(1 for h in hadiths for c in h["chains"] for i in c if isinstance(i, str))
    print(f"corpus: {sum(1 for h in hadiths if h['book'] == 'bukhari')} bukhari + "
          f"{sum(1 for h in hadiths if h['book'] == 'muslim')} muslim hadiths, "
          f"{sum(len(h['chains']) for h in hadiths)} chains ({unresolved} unresolved positions), "
          f"{len(narrators)} narrators, {sum(len(h['rel']) for h in hadiths)} direct takhrij links; compilers {compilers}")


if __name__ == "__main__":
    main()
