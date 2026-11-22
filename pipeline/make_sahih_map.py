"""«خارطة الحديث الصحيح»: how many marfu' hadiths judged sahih (or sahih and hasan) each book adds, without
repeats, to the books before it -> site/data/sahihmap.json. Runs after build_site.py and make_zawaid.py.

Order: the nine books as on the site, then the zawa'id over the nine. A hadith belongs to the first book that has it.
- the nine: the same greedy repeat test as explore.json in build_site.py (a rel link to an earlier kept hadith whose
  matn shares at least 0.3 of the rarity-weighted words), so al-Bukhari's marfu' gives the same 2,603;
- the zawa'id are outside the nine by definition (the program's takhrij); a repeat among them = same companion
  and a close matn (0.4).
Verdicts: the Sahihayn are sahih; elsewhere the verdicts shown on the site, sorted the way app.js gradeClass /
zGrade / zClass sort them (the scholars differ -> left out; no explicit verdict -> left out). The Muwatta has none.
"""
import math
import re
from collections import Counter

from build_site import BOOK_ORDER, BOOKS, GRADES
from common import SITE_DATA, WORK, dump, load, strip_diacritics

ZBOOKS = ["ibnhibban", "ibnkhuzayma", "mustadrak", "abuyala", "bazzar", "kabir", "awsat", "saghir"]
# the books whose list shows one verdict first (ZBOOKS[..].primary in app.js)
PRIMARY = {"mustadrak": ["risala", "dhahabi", "hakim"], "abuyala": ["asad", "haythami"]}
MARFU = ("مرفوع", "قدسي")
DIAC = re.compile("[ً-ْٰـ]")


def grade_class(v):
    """app.js gradeClass: sahih | hasan | daif | "" from the verdict on the hadith itself"""
    t = DIAC.sub("", str(v))
    m = re.search(r"والحديث\s+([^،.]+)", t)
    t = m.group(1) if m else re.split(r"،\s*وهذا\s+إسناد|،", t)[0]
    if re.search("ضعيف|منكر|موضوع|باطل|لا أصل|شاذ|واه|مكذوب|كذب|مرسل", t):
        return "daif"
    if re.search("صحيح|متفق عليه", t):
        return "sahih"
    if re.search("حسن|جيد|قوي", t):
        return "hasan"
    return ""


def z_grade(v):
    """app.js zGrade: gradeClass plus the zawa'id wordings"""
    c = grade_class(v)
    if c:
        return c
    t = DIAC.sub("", str(v))
    if re.search("منقطع|لم يصح|لا يصح|مظلم|متروك|كذاب|ليس بصحيح|فيه ضعف|لين|تالف|ساقط", t):
        return "daif"
    return "sahih" if "على شرط" in t else ""


def combine(classes):
    c = {x for x in classes if x}
    if not c:
        return "none"
    if len(c) == 1:
        return c.pop()
    return "mixed" if "daif" in c else "hasan"


norm = lambda t: re.sub("[إأآ]", "ا", strip_diacritics(t)).replace("ة", "ه").replace("ى", "ي")
words = lambda t: set(re.findall(r"[ء-ي]{2,}", norm(t)))
matn_of = lambda parts: " ".join(p["text"][p["matn"][0]:p["matn"][1]] for p in parts if p.get("matn"))


def rarity(sets):
    df = Counter(w for ws in sets for w in ws)
    return {w: math.log(len(sets) / c) for w, c in df.items()}


def main():
    C = load(WORK / "corpus.json")
    grades = {f.stem: load(f) for f in sorted(GRADES.glob("*.json"))}

    # ---------- the nine books ----------
    H = {}
    for h in C["hadiths"]:
        b = h["book"]
        rows = [r for n in [h["num"], *h.get("aliases", [])] for r in grades.get(b, {}).get(str(n), [])]
        if b == "ibnmajah" and len(rows) > 1:     # al-Albani grades every hadith; al-Busiri's notes quote others
            rows = [r for r in rows if r[0] != "busiri"]
        H[h["key"]] = {"book": b, "num": int(h["num"]), "marfu": h["type"] in MARFU, "rel": h["rel"],
                       "cls": "sahih" if b in ("bukhari", "muslim") else combine(grade_class(r[1]) for r in rows),
                       "w": words(matn_of(h["parts"]))}
    rar = rarity([h["w"] for h in H.values()])
    weight = lambda ws: sum(rar[w] for w in ws)
    for h in H.values():
        h["W"] = weight(h["w"])
    seq = {k: i for i, k in enumerate(sorted(H, key=lambda k: (BOOK_ORDER[H[k]["book"]], H[k]["num"], k)))}

    def same(a, b):
        A, B = H[a]["w"], H[b]["w"]
        return not A or not B or weight(A & B) >= 0.3 * min(H[a]["W"], H[b]["W"])

    # ---------- the zawa'id ----------
    Z = {b: [] for b in ZBOOKS}
    for b in ZBOOKS:
        listing = load(SITE_DATA / "z" / f"{b}.json")
        for sh in sorted({h["sh"] for h in listing["hadiths"]}):
            for n, h in load(SITE_DATA / "z" / b / f"{sh}.json")["hadiths"].items():
                said = [g for g in h["grades"] if g.get("v")]
                if b in PRIMARY:
                    lead = next((g for s in PRIMARY[b] for g in said if g["s"] == s and z_grade(g["v"])), None)
                    cls = z_grade(lead["v"]) if lead else "none"
                else:
                    cls = combine(z_grade(g["v"]) for g in said)
                Z[b].append({"cls": cls, "comp": {c["ids"][0] for c in h["chains"] if c["ids"]},
                             "w": words(matn_of(h["parts"]) or " ".join(p["text"] for p in h["parts"]))})
    zrar = rarity([h["w"] for zs in Z.values() for h in zs])
    zweight = lambda ws: sum(zrar[w] for w in ws)
    for zs in Z.values():
        for h in zs:
            h["W"] = zweight(h["w"])

    def run(ok):
        """{book: [hadiths with the verdict, of them not found in an earlier book]}"""
        out, kept = {}, set()
        for b in BOOKS:
            keys = sorted((k for k, h in H.items() if h["book"] == b and h["marfu"] and ok(h["cls"])), key=seq.get)
            new = 0
            for k in keys:
                if not any(r in kept and same(k, r) for r in H[k]["rel"]):
                    new += 1
                kept.add(k)
            out[b] = [len(keys), new]
        zkept = []
        for b in ZBOOKS:
            hs = [h for h in Z[b] if ok(h["cls"])]
            new = 0
            for h in hs:
                if not any(p["comp"] & h["comp"] and zweight(p["w"] & h["w"]) >= 0.4 * min(p["W"], h["W"]) for p in zkept):
                    new += 1
                zkept.append(h)
            out[b] = [len(hs), new]
        return out

    result = {
        "order": list(BOOKS) + ZBOOKS,
        "marfu": {**{b: sum(1 for h in H.values() if h["book"] == b and h["marfu"]) for b in BOOKS},
                  **{b: len(Z[b]) for b in ZBOOKS}},
        "sahih": run(lambda c: c == "sahih"),
        "maqbul": run(lambda c: c in ("sahih", "hasan")),
    }
    dump(result, SITE_DATA / "sahihmap.json")
    for m in ("sahih", "maqbul"):
        print(m, sum(v[1] for v in result[m].values()), {b: v[1] for b, v in result[m].items()})


if __name__ == "__main__":
    main()
