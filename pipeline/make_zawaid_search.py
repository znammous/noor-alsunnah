"""Search index for the zawa'id books, built from their shards in site/data/z/<book>/.

  python3 make_zawaid_search.py            every zawa'id book
  python3 make_zawaid_search.py bazzar     one book

Writes site/data/search/z-<book>.json in the format of the nine books' index
([key, group, text, bab, number label, matn ranges, grade class]); the key is z:<book>:<n>,
the group is empty, and the grade class is left to the browser, which reads it from the book's
list with the same rules as the zawa'id pages.
"""
import re
import sys

from common import _DIACRITICS as DIACRITIC, SITE_DATA, dump, load

BOOKS = ["ibnhibban", "ibnkhuzayma", "mustadrak", "abuyala", "bazzar", "kabir", "awsat", "saghir"]


def search_text(h):
    """the text without diacritics, char for char, and the matn ranges in it (as in build_site.py)"""
    out, ranges, pos = [], [], 0
    for p in h["parts"]:
        t = re.sub(r"\s", " ", p["text"])
        kept = [i for i, ch in enumerate(t) if not DIACRITIC.match(ch)]
        at = {i: j for j, i in enumerate(kept)}
        plain = "".join(t[i] for i in kept)
        if p.get("matn"):
            s0, e0 = p["matn"]
            s1 = next((at[i] for i in range(s0, len(t)) if i in at), len(plain))
            e1 = next((at[i] + 1 for i in range(min(e0, len(t)) - 1, -1, -1) if i in at), 0)
            if e1 > s1:
                ranges += [pos + s1, pos + e1]
        out.append(plain)
        pos += len(plain) + 1
    return " ".join(out), ranges


def build(book):
    listing = load(SITE_DATA / "z" / f"{book}.json")
    kitabs = {no: title for no, title, *_ in listing["kitabs"]}
    shards = {}
    rows = []
    for h in listing["hadiths"]:
        sh = shards.get(h["sh"]) or shards.setdefault(h["sh"], load(SITE_DATA / "z" / book / f"{h['sh']}.json")["hadiths"])
        full = sh[h["n"]]
        text, ranges = search_text(full)
        bab = DIACRITIC.sub("", full.get("bab") or kitabs.get(full.get("kitab"), ""))
        rows.append([f"z:{book}:{h['n']}", None, text, bab, h.get("label") or h["n"], ranges, ""])
    dump(rows, SITE_DATA / "search" / f"z-{book}.json")
    print(f"{book}: {len(rows)} hadiths in the search index")


if __name__ == "__main__":
    for b in [a for a in sys.argv[1:] if a in BOOKS] or BOOKS:
        build(b)
