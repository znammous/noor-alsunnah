"""The six books from the Jami' Khadim al-Haramayn program -> data/work/corpus.json

Source: برنامج جامع خادم الحرمين الشريفين للسنة النبوية (sunna.alifta.gov.sa), General
Presidency of Scholarly Research and Ifta, via the structured export by Jehad Oumer
(Kaggle: jehadoumer/ifta-hadith-corpus-original + ifta-hadith-isnad-linked-graph-data).

* One hadith = one customary number (Fath al-Bari for Bukhari, Abd al-Baqi for Muslim, and
  the numbering of the program for the Sunan); records sharing a number are merged.
  Unnumbered records carrying an isnad (e.g. قال الفربري ...) join the preceding hadith.
* Chains come ID-linked from the graph export; records missing there fall back to the
  name chains of the original export, resolved by unique display name.
* Kitabs come from pipeline/toc (make_toc.py for the Sahihayn, make_toc_shamela.py for the Sunan).
* Al-Tirmidhi's own verdicts ("هذا حديث حسن صحيح") are kept verbatim from his text.
"""
import json
import re
from bisect import bisect_right
from collections import defaultdict
from pathlib import Path

from common import RAW, WORK, dump, strip_diacritics

SRC = RAW / "ifta"
TOC = Path(__file__).resolve().parent / "toc"
# book key -> (Ifta file slug, program book id, URL prefix, compiler names at the end of chains)
BOOKS = {
    "bukhari": ("sahih-al-bukhari", 1, "b", {"البخاري"}),
    "muslim": ("sahih-muslim", 2, "m", {"مسلم"}),
    "abudawud": ("sunan-abi-dawud", 3, "d", {"أبو داود السجستاني", "أبو داود"}),
    "tirmidhi": ("jami-al-tirmidhi", 4, "t", {"الترمذي"}),
    "nasai": ("sunan-al-nasai", 5, "n", {"النسائي"}),
    "ibnmajah": ("sunan-ibn-majah", 6, "j", {"ابن ماجه"}),
}
BOOK_IDS = {v[1]: k for k, v in BOOKS.items()}
# al-Tirmidhi's own verdict after the matn: "هذا حديث حسن صحيح" / "حديث المغيرة حديث حسن غريب"
TIRMIDHI_VERDICT = re.compile(
    r"(?:هذا|حديث(?:\s+[^\s.،:]+){1,3})\s+حديث\s+(?:حسن|صحيح|غريب)(?:\s+(?:حسن|صحيح|غريب))*"
    r"(?:\s+(?:من\s+هذا\s+الوجه|لا\s+نعرفه\s+إلا\s+من\s+(?:هذا\s+الوجه|حديث\s+[^\s.،]+(?:\s+[^\s.،]+)?)))?")


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


def infer_numbers(records):
    """Some records lost their printed number ("- حدثنا ..."). When the unnumbered records
    between hadiths N and M are exactly M-N-1, they are N+1 ... M-1 in order."""
    inferred, last, pending = {}, None, []
    for rec in records:
        num = rec["hadith_num"].strip()
        if num.isdigit():
            if pending and last is not None and int(num) - last - 1 == len(pending):
                for i, r in enumerate(pending, 1):
                    inferred[r["mainId"]] = str(last + i)
            pending, last = [], int(num)
        elif rec["chain_of_narrators"]:
            pending.append(rec)
    return inferred


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
    for book, (slug, book_id, prefix, compiler_names) in BOOKS.items():
        original = read(SRC / "original" / f"{slug}.json")
        graph = {h["mainId"]: h for h in read(SRC / "graph" / f"{slug}.json")}
        toc = read(TOC / f"{book}.json")
        toc_main = [r[0] for r in toc]
        current = None
        inferred = infer_numbers(original)
        for rec in original:
            num = rec["hadith_num"].strip() or inferred.get(rec["mainId"], "")
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
                key = f"{prefix}{num}"
                if key not in by_key:          # Muslim repeats a number in more than one place
                    k = bisect_right(toc_main, rec["mainId"]) - 1
                    by_key[key] = {
                        "key": key, "book": book, "num": num, "aliases": [],
                        "kitab_no": k + 1, "kitab": toc[max(k, 0)][2], "bab": rec["chapter"].strip(),
                        "type": hadith_type(rec["features"]), "parts": [], "chains": [],
                        "main_ids": [], "takhreej": [], "shawahed": [], "comparisons": [], "verdicts": [],
                    }
                    hadiths.append(by_key[key])
                current = by_key[key]
            if current is None:
                continue
            # an unnumbered record belongs to the hadith before it only within the same bab
            # (this keeps e.g. al-Tirmidhi's closing «العلل» out of his last hadith)
            if not num and rec["chapter"].strip() != current["bab"]:
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
                if c and c[-1][1].strip() in compiler_names:
                    compilers[book] = c[-1][0]
                    c = c[:-1]
                current["chains"].append([i for i, _ in c])
            if book == "tirmidhi":
                plain = re.sub(r"\s+", " ", re.sub(r"\[\d+/\d+\]", " ", strip_diacritics(rec["hadith_text"])))
                for v in TIRMIDHI_VERDICT.finditer(plain):
                    verdict = v.group(0).strip()
                    if verdict not in current["verdicts"]:
                        current["verdicts"].append(verdict)
            current["takhreej"] += [[t.get("bookId"), t.get("book_name"), t.get("mainId")] for t in rec.get("takhreej") or []]
            current["shawahed"] += [[s.get("rawy_name"), s.get("bookId"), s.get("mainId")] for s in rec.get("shawahed") or []]
            current["comparisons"] += [[c.get("comparison_type"), c.get("bookId"), c.get("mainId")] for c in rec.get("comparisons") or []]

    # an extra number inside a record ("299 - ... 300 - ...") only counts when it falls before the
    # next numbered hadith of the same book; other digits in the text are not hadith numbers
    for book in BOOKS:
        mine = sorted((int(h["num"]), h) for h in hadiths if h["book"] == book)
        for (n, h), nxt in zip(mine, [m for m, _ in mine[1:]] + [10 ** 6]):
            h["aliases"] = sorted({a for a in h["aliases"] if n < int(a) < nxt}, key=int)

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
    counts = {b: sum(1 for h in hadiths if h["book"] == b) for b in BOOKS}
    print(f"corpus: {counts}, tirmidhi verdicts on {sum(1 for h in hadiths if h['verdicts'])} hadiths, "
          f"{sum(len(h['chains']) for h in hadiths)} chains ({unresolved} unresolved positions), "
          f"{len(narrators)} narrators, {sum(len(h['rel']) for h in hadiths)} direct takhrij links; compilers {compilers}")


if __name__ == "__main__":
    main()
