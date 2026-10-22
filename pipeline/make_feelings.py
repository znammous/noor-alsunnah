"""«بماذا تشعر؟»: the encyclopedia's hadiths (hadeethenc.com) grouped by the feelings they treat
-> site/data/feel/index.json (the feelings and the words that name them) and site/data/feel/<id>.json

pipeline/feelings/feelings.json lists the feelings; pipeline/feelings/tags.json gives, for each
encyclopedia hadith, the feelings it helps with: [feeling, role, weight], where role is "dua" (a
supplication or dhikr to say), "bushra" (comfort and glad tidings) or "amal" (guidance to follow),
and weight 3 means the hadith is about that state, 2 that it helps with it. The tags were proposed
by reading each hadith with its explanation, then reviewed feeling by feeling. pipeline/feelings/extra.json
adds a few hadiths of the nine books that the encyclopedia lacks (the supplications for الهم and الكرب),
with their own short note.

Only encyclopedia hadiths tied to a hadith of the nine books (make_sharh.py) and not graded weak are
kept; each links to its narration in the first of the nine books that has it.
Run after make_sharh.py (build.sh runs it).
"""
import re
import sys
from collections import defaultdict
from pathlib import Path

from common import RAW, SITE_DATA, dump, load, strip_diacritics

HERE = Path(__file__).resolve().parent
FEEL = HERE / "feelings"
BOOK_ORDER = "bmdtnjawr"  # key prefixes in the order of the nine books
ROLES = ["dua", "bushra", "amal"]


def first_sentence(text, limit=190):
    text = re.sub(r"\s+", " ", text or "").strip()
    cut = re.search(r"[.؛!؟]\s", text[40:limit + 40])
    if cut:
        return text[:40 + cut.start() + 1]
    return text if len(text) <= limit else text[:limit].rsplit(" ", 1)[0] + "…"


def main():
    feelings = load(FEEL / "feelings.json")
    tags = load(FEEL / "tags.json")
    enc = load(RAW / "hadeethenc" / "ar.json")
    keys_of = defaultdict(list)
    for key, eids in load(HERE / "sharh" / "links.json").items():
        for e in eids:
            keys_of[str(e)].append(key)
    known = {f["id"] for f in feelings}
    rows = defaultdict(list)
    for eid, ts in tags.items():
        h = enc.get(eid)
        if not h or not keys_of.get(eid) or "ضعيف" in (h.get("grade") or ""):
            continue
        key = min(keys_of[eid], key=lambda k: (BOOK_ORDER.index(k[0]), int(k[1:])))
        for fid, role, weight in ts:
            if fid in known and role in ROLES and weight in (2, 3):
                rows[fid].append({"e": int(eid), "k": key, "r": role, "w": weight,
                                  "t": strip_diacritics(h["title"]).strip(), "a": (h.get("attribution") or "").strip(),
                                  "x": first_sentence(h.get("explanation"))})
    for x in load(FEEL / "extra.json"):
        for fid, role, weight in x["tags"]:
            if not any(r["k"] == x["k"] for r in rows[fid]):
                rows[fid].append({"k": x["k"], "r": role, "w": weight, "t": x["t"], "a": x["a"], "x": x["x"]})
    out = SITE_DATA / "feel"
    index = []
    for f in feelings:
        rs = sorted(rows[f["id"]], key=lambda r: (-r["w"], BOOK_ORDER.index(r["k"][0]), int(r["k"][1:])))
        dump(rs, out / f"{f['id']}.json")
        index.append({"id": f["id"], "name": f["name"], "feel": f["feel"], "syn": f["syn"], "n": len(rs)})
        print(f"  {f['name']}: {len(rs)}", file=sys.stderr)
    dump(index, out / "index.json")


if __name__ == "__main__":
    main()
