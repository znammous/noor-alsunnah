"""Sahih al-Bukhari from hatemben/hadithdb -> data/work/bukhari.json

The source lists a hadith's narrators as one flat sequence even when the isnad
switches chains (تحويل "ح") or joins two narrators with "و" (e.g. يونس ومعمر عن
الزهري). We rebuild the transmission DAG from the text and then expand it into
top-down chains: [companion, ..., al-Bukhari's own shaykh].
Narrator IDs are prefixed with "b" until they are aligned to MIDS IDs.
"""
import re
from collections import defaultdict

from common import RAW, WORK, dump, load, strip_diacritics

SRC = RAW / "hadithdb"
COMPILER = "@"
TAHWIL = re.compile(r"\(\s*ح\s*\)|(?:^|[\s،,.:])ح(?:[\s،,.:]|$)")
MAX_CHAINS = 64


def clean_name(s: str) -> str:
    return s.strip().strip("،,.:؛ ").strip()


def starts_with_waw(s: str) -> bool:
    return strip_diacritics(s).startswith("و")


def build_dag(h, db):
    """Return ({student: set(teachers)} with COMPILER at the bottom, text with names spaced)."""
    text = h["text"]
    teachers = defaultdict(set)
    cur, below = [COMPILER], []
    pos = 0
    for i, n in enumerate(h["narrators"]):
        name = clean_name(n["name"])
        # unnamed narrators ("امرأة", "وغيره") get a node private to this hadith
        nid = f"b{n['id']}" if "id" in n else f"mubham:{h['hadith_number']}:{i}:{name}"
        start = text.find(name, pos)
        gap = text[pos:start] if start >= 0 else ""
        if start >= 0:
            # the source drops the spaces around linked names: "حَدَّثَنَاالْحُمَيْدِيُّ"
            end = start + len(name)
            if start > 0 and not text[start - 1].isspace():
                text = text[:start] + " " + text[start:]
                start, end = start + 1, end + 1
            if end < len(text) and text[end].isalpha():
                text = text[:end] + " " + text[end:]
            pos = end

        entry = db.get(str(n.get("id")), {})
        canonical = entry.get("data", {}).get("الاسم", "").lstrip(": ") or entry.get("name", "")
        conj = i > 0 and starts_with_waw(name) and not starts_with_waw(canonical)
        conj = conj or (i > 0 and strip_diacritics(gap).rstrip().endswith(("، و", " و")))
        tahwil = i > 0 and bool(TAHWIL.search(strip_diacritics(gap)))

        if tahwil:
            below, cur = [COMPILER], [nid]
            teachers[COMPILER].add(nid)
        elif conj and below:
            cur.append(nid)
            for s in below:
                if s != nid:
                    teachers[s].add(nid)
        else:
            for s in cur:
                if s != nid:
                    teachers[s].add(nid)
            below, cur = cur, [nid]
    return teachers, text


def expand(teachers):
    """All top-down paths ending at COMPILER (compiler itself excluded)."""
    out = []

    def walk(node, path):
        if len(out) >= MAX_CHAINS:
            return
        ups = [t for t in teachers.get(node, ()) if t not in path]
        if not ups:
            if len(path) > 1:
                out.append(list(reversed(path[1:])))
            return
        for t in sorted(ups):
            walk(t, path + [t])

    walk(COMPILER, [COMPILER])
    # drop chains that are strict suffixes of a longer chain (artefacts of conjunction joins)
    keys = {tuple(c) for c in out}
    return [c for c in out if not any(len(k) > len(c) and k[-len(c):] == tuple(c) for k in keys)]


def main():
    hadiths_src = load(SRC / "bukhari_sultania_copy.json")
    db = load(SRC / "narrators_db.json")

    narrators = {}
    for k, v in db.items():
        d = v.get("data", {})
        narrators[f"b{k}"] = {
            "id": f"b{k}",
            "name": clean_name(v["name"]),
            "full": d.get("الاسم", "").lstrip(": ").strip(),
            "data": d,
        }

    hadiths = []
    for h in hadiths_src:
        teachers, text = build_dag(h, db)
        chains = expand(teachers)
        text = re.sub(r"^[٠-٩\d]+\s*-\s*", "", text).strip()
        text = re.sub(r"([،:؛])(?=[^\s»«\"])", r"\1 ", text)
        text = re.sub(r"\s*([﴾-﷿])\s*", r" \1 ", text).replace("  ", " ")
        hadiths.append({
            "book": "bukhari",
            "num": int(h["hadith_number"]),
            "categories": h.get("categories"),
            "text": text,
            "chains": chains,
        })

    n_chains = sum(len(h["chains"]) for h in hadiths)
    dump({"narrators": narrators, "hadiths": hadiths}, WORK / "bukhari.json")
    print(f"bukhari: {len(hadiths)} hadiths, {n_chains} chains, {len(narrators)} narrators")


if __name__ == "__main__":
    main()
