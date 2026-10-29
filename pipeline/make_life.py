"""«الحديث في حياتنا»: the encyclopedia's hadiths (hadeethenc.com) grouped for everyday use
-> site/data/<collection>/index.json (the topics and the words that name them) and <collection>/<topic>.json

Two collections, each a folder of pipeline/:
- feelings -> site/data/feel: «بماذا تشعر؟», the feelings a hadith treats
- ahwal -> site/data/ahwal: «ماذا أقول عندما…؟», the situations a hadith gives a dhikr or sunnah for
- tazkiya -> site/data/tazkiya: «تزكية النفس», the virtue a hadith builds or the vice it treats; each topic
  has a group g, "tahliya" (virtues to acquire) or "takhliya" (vices to shed)
- nawawi -> site/data/nawawi: «الأربعون النووية», one list in the book's order rather than topics.
  nawawi/nawawi.json gives each hadith its number n, a heading h, its narration k in the nine books
  (null for 30 and 41, which they lack) and its encyclopedia hadith e; kept whatever its grade, being
  al-Nawawi's own choice

In each folder, <folder>.json lists the topics; tags.json gives, for each encyclopedia hadith, the topics
it serves: [topic, role, weight], where role is "dua" (words to say), "bushra" (comfort, glad tidings or
the reward of an act) or "amal" (guidance or a sunnah to follow), and weight 3 means the hadith is about
that topic, 2 that it serves it. The tags were proposed by reading each hadith with its explanation,
then reviewed topic by topic. extra.json (optional) adds hadiths of the nine books that the encyclopedia
lacks, with their own short note.

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
COLLECTIONS = [("feelings", "feel"), ("ahwal", "ahwal"), ("tazkiya", "tazkiya")]
BOOK_ORDER = "bmdtnjawr"  # key prefixes in the order of the nine books
ROLES = ["dua", "bushra", "amal"]


def first_sentence(text, limit=190):
    text = re.sub(r"\s+", " ", text or "").strip()
    cut = re.search(r"[.؛!؟]\s", text[40:limit + 40])
    if cut:
        return text[:40 + cut.start() + 1]
    return text if len(text) <= limit else text[:limit].rsplit(" ", 1)[0] + "…"


def build(folder, out, enc, keys_of):
    src = HERE / folder
    topics = load(src / f"{folder}.json")
    known = {t["id"] for t in topics}
    rows = defaultdict(list)
    for eid, ts in load(src / "tags.json").items():
        h = enc.get(eid)
        if not h or not keys_of.get(eid) or "ضعيف" in (h.get("grade") or ""):
            continue
        key = min(keys_of[eid], key=lambda k: (BOOK_ORDER.index(k[0]), int(k[1:])))
        for tid, role, weight in ts:
            if tid in known and role in ROLES and weight in (2, 3):
                rows[tid].append({"e": int(eid), "k": key, "r": role, "w": weight,
                                  "t": re.sub(r"[«»]", "", strip_diacritics(h["title"])).strip(), "a": (h.get("attribution") or "").strip(),
                                  "x": first_sentence(h.get("explanation"))})
    for x in load(src / "extra.json") if (src / "extra.json").exists() else []:
        for tid, role, weight in x["tags"]:
            if not any(r["k"] == x["k"] for r in rows[tid]):
                rows[tid].append({"k": x["k"], "r": role, "w": weight, "t": x["t"], "a": x["a"], "x": x["x"]})
    index = []
    for t in topics:
        rs = sorted(rows[t["id"]], key=lambda r: (-r["w"], BOOK_ORDER.index(r["k"][0]), int(r["k"][1:])))
        # the encyclopedia has some hadiths twice, at times tied to different narrations; one card each
        seen = set()
        rs = [r for r in rs if not ({r["k"], r["t"]} & seen or seen.update((r["k"], r["t"])))]
        dump(rs, SITE_DATA / out / f"{t['id']}.json")
        index.append({"id": t["id"], "name": t["name"], "feel": t["feel"], "syn": t["syn"], "n": len(rs),
                      **({"g": t["g"]} if t.get("g") else {})})
        print(f"  {t['name']}: {len(rs)}", file=sys.stderr)
    dump(index, SITE_DATA / out / "index.json")


def build_nawawi(enc):
    rows = []
    for x in load(HERE / "nawawi" / "nawawi.json"):
        h = enc[str(x["e"])]
        a = (h.get("attribution") or "").strip()
        grade = (h.get("grade") or "").strip()
        rows.append({"n": x["n"], "h": x["h"], "e": x["e"], "r": "nass", "w": 3,
                     "t": re.sub(r"[«»]", "", strip_diacritics(h["title"])).strip(),
                     "a": a if grade in ("", "صحيح") or grade in a else f"{a} · {grade}",
                     "x": first_sentence(h.get("explanation")), **({"k": x["k"]} if x["k"] else {})})
    dump(rows, SITE_DATA / "nawawi" / "arbaun.json")
    dump([{"id": "arbaun", "name": "الأربعون النووية", "feel": "", "syn": [], "n": len(rows)}],
         SITE_DATA / "nawawi" / "index.json")
    print(f"nawawi: {len(rows)}", file=sys.stderr)


def main():
    enc = load(RAW / "hadeethenc" / "ar.json")
    keys_of = defaultdict(list)
    for key, eids in load(HERE / "sharh" / "links.json").items():
        for e in eids:
            keys_of[str(e)].append(key)
    for folder, out in COLLECTIONS:
        if (HERE / folder / "tags.json").exists():
            print(folder, file=sys.stderr)
            build(folder, out, enc, keys_of)
    build_nawawi(enc)


if __name__ == "__main__":
    main()
