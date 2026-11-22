#!/usr/bin/env python3
"""ربط أحاديث «معالم السنة النبوية» بأحاديث برنامج «الجامع».

نص OCR يُستعمل للمطابقة فقط؛ والمخزَّن لكل حديث مفتاحُ حديث «الجامع» (b6557، m1905، ibnhibban:123 …)
ليُعرض نصه الأصلي، مع ما ينفرد به «المعالم»: رقمه وأبوابه وحكمه.

الطريقة لكل إحالة في الحديث:
  1. بالرقم: الكتب التي يوافق ترقيمُها ترقيمَ «الجامع» (الستة والدارمي وابن حبان وابن خزيمة)،
     الرقم نفسه ثم ±3 (أخطاء OCR في الأرقام).
  2. بالنص داخل الكتاب نفسه: لما لم يُطابق، ولأحمد (ترقيم الرسالة) والموطأ والمستدرك والمختارة
     والبيهقي (يُحال إليه بالجزء والصفحة).
الدرجة = نسبة كلمات متن «المعالم» (بعد حذف الشائع) الموجودة في متن حديث «الجامع».

المدخل:  data/raw/maalim/maalim.json
المخرج:  data/raw/maalim/maalim_links.json  و  maalim_links_review.tsv (ما لم يُحسم)
"""
import json
import math
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw" / "maalim"
WORK = ROOT / "data" / "work"

DIAC = re.compile(r"[ؐ-ًؚ-ٰٟۖ-ۭـ]")
NINE = {"bukhari": "خ", "muslim": "م", "abudawud": "د", "tirmidhi": "ت", "nasai": "ن",
        "ibnmajah": "جه", "darimi": "مي", "ahmad": "حم", "muwatta": "ط"}
# رمز «المعالم» -> (مفتاح الكتاب، ملف «الجامع» المختصر) لغير التسعة
OTHER = {"حب": ("ibnhibban", "sahih-ibn-hibban"), "مه": ("ibnkhuzayma", "sahih-ibn-khuzaymah"),
         "ك": ("mustadrak", "al-mustadrak-ala-al-sahihayn"), "هق": ("bayhaqi", "sunan-al-bayhaqi-al-kubra"),
         "مخ": ("mukhtara", "al-ahadith-al-mukhtarah")}
SYM_ALIAS = {"دا": "د"}
BY_NUMBER = {"خ", "م", "د", "ت", "ن", "جه", "مي", "حب", "مه"}
OK, WEAK, GLOBAL = 0.5, 0.35, 0.6


def words(s):
    s = DIAC.sub("", s or "").replace("ﷺ", " ")
    s = re.sub("[أإآٱ]", "ا", s).replace("ى", "ي").replace("ة", "ه").replace("ؤ", "و").replace("ئ", "ي")
    return re.findall(r"[ء-ي]{3,}", s)


class Book:
    def __init__(self, sym, name):
        self.sym, self.name = sym, name
        self.by_num, self.recs = {}, []          # num -> rec index ; rec = (key, num, matn words, all words)
        self.inv = defaultdict(list)

    def add(self, key, nums, text, full=None):
        w = set(words(text))
        i = len(self.recs)
        self.recs.append((key, nums[0] if nums else "", w, set(words(full)) if full else w))
        for n in nums:
            self.by_num.setdefault(str(n), i)
        for x in w:
            self.inv[x].append(i)

    def finish(self):
        n = len(self.recs) or 1
        self.idf = {x: math.log(n / len(v)) for x, v in self.inv.items()}

    def search(self, w, top=8):
        sc = Counter()
        for x in w:
            post = self.inv.get(x)
            if post and len(post) < 3000:
                for i in post:
                    sc[i] += self.idf[x]
        return [i for i, _ in sc.most_common(top)]


def load_books():
    books = {}
    corpus = json.load(open(WORK / "corpus.json"))["hadiths"]
    for b, sym in NINE.items():
        books[sym] = Book(sym, b)
    for h in corpus:
        txt = " ".join(p["text"][p["matn"][0]:p["matn"][1]] if p.get("matn") else p["text"] for p in h["parts"])
        books[NINE[h["book"]]].add(h["key"], [h["num"]] + h["aliases"], txt,
                                   " ".join(p["text"] for p in h["parts"]))
    for sym, (key, slug) in OTHER.items():
        bk = books[sym] = Book(sym, key)
        for main_id, (num, text) in json.load(open(WORK / "slim" / "other" / f"{slug}.json")).items():
            bk.add(f"{key}:{num or 'id' + main_id}", [num] if num else [], text)
    for bk in books.values():
        bk.finish()
    return books


NAME_STOP = {"ابن", "ابي", "عبد", "الله", "رضي", "عنه", "عنها", "عنهما", "قال", "قالت", "النبي", "رسول",
             "انه", "انها", "سمعت", "سمع", "جده", "ابيه", "رجل", "امراه", "وعنه", "وعنها"}


def companion(text):
    """الكلمات المميزة لاسم الصحابي في أول متن «المعالم» («عن أبي هريرة» -> {هريره})."""
    m = re.match(r"^\s*و?عَ?نِ?\s+(.{0,60}?)(?:\s*[:،,(]|\s+قَ?ا?لَ?|\s+أَ?نَّ|\s+عَنِ?\s)", text)
    if not m:
        return set()
    return {x for x in words(m.group(1))[:4] if x not in NAME_STOP and len(x) >= 3}


def variants(n):
    """الرقم المذكور ثم ما يحتمله خطأ OCR: ±1..3، وحذف أول رقم أو آخره (١٥٤٧١ -> ٥٤٧١)."""
    out = [(n, "number")] + [(n + k, f"number{k:+d}") for k in (1, -1, 2, -2, 3, -3)]
    t = str(n)
    if len(t) >= 3:
        out += [(int(t[1:]), "number-ocr"), (int(t[:-1]), "number-ocr")]
    return out


def main():
    books = load_books()
    df = Counter()
    for bk in books.values():
        for _, _, w, _ in bk.recs:
            df.update(w)
    total = sum(len(bk.recs) for bk in books.values())
    stop = {x for x, c in df.items() if c > total * 0.05}

    maalim = json.load(open(RAW / "maalim.json"))
    out, review = [], []
    stat = Counter()
    for h in maalim:
        w = set(words(h["text"])) - stop
        links = []
        comp = companion(h["text"])
        if not h["empty"] and len(w) >= 3:
            seen = set()
            for r in h["refs"]:
                sym = SYM_ALIAS.get(r["sym"], r["sym"])
                bk = books.get(sym)
                if not bk or (sym, tuple(r.get("nums") or ()), r.get("bab")) in seen:
                    continue
                seen.add((sym, tuple(r.get("nums") or ()), r.get("bab")))
                cited = r["nums"][0] if r.get("nums") else None

                def score(i):
                    return len(w & bk.recs[i][2]) / len(w)
                best = (0, None, None)
                if sym in BY_NUMBER and cited is not None and not (sym == "خ" and r.get("bab")):
                    for n, how in [v for c in r["nums"] for v in variants(c)]:
                        i = bk.by_num.get(str(n))
                        if i is not None:
                            s = score(i)
                            if s > best[0] + (0 if how == "number" else 0.1):
                                best = (s, i, how)
                if best[0] < OK:
                    # البحث بالنص: يُشترط اسم الصحابي في نص «الجامع» بإسناده، ويُقدَّم مرشح الرقم
                    # إن كان قريبًا منه
                    margin = 0.15 if best[0] >= WEAK else 0.05
                    for i in bk.search(w):
                        if comp and not (comp & bk.recs[i][3]):
                            continue
                        s = score(i)
                        if s > best[0] + margin:
                            best, margin = (s, i, "text"), 0.05
                s, i, how = best
                if i is None:
                    continue
                links.append({"sym": sym, "cited": cited if cited is not None else r.get("bab"),
                              "key": bk.recs[i][0], "num": bk.recs[i][1],
                              "score": round(s, 2), "how": how})
        # لا إحالة مطابقة (سقط سطرها في OCR غالبًا): بحث نصي في الكتب كلها بشرط أشد
        if not h["empty"] and len(w) >= 5 and not any(l["score"] >= OK for l in links):
            best = (0, None, None)
            for bk in books.values():
                for i in bk.search(w, 5):
                    if comp and not (comp & bk.recs[i][3]):
                        continue
                    sc = len(w & bk.recs[i][2]) / len(w)
                    if sc > best[0]:
                        best = (sc, i, bk)
            if best[0] >= GLOBAL:
                sc, i, bk = best
                links.append({"sym": bk.sym, "cited": None, "key": bk.recs[i][0], "num": bk.recs[i][1],
                              "score": round(sc, 2), "how": "text-global"})
        # الرقم المذكور نفسه مع درجة متوسطة يكفي (تشوّه OCR يخفض الدرجة)
        for l in links:
            if l["how"] == "number" and WEAK <= l["score"] < OK:
                l["how"] = "number-weak"
        good = [l for l in links if l["score"] >= OK or l["how"] == "number-weak"]
        weak = [l for l in links if WEAK <= l["score"] < OK and l not in good]
        status = "linked" if good else "weak" if weak else "empty" if h["empty"] else "unlinked"
        stat[status] += 1
        # الحديث الأصل: أعلى المطابقات، ويُقدَّم ما طابق بالرقم المذكور نفسه
        primary = max(good or weak or [None], key=lambda l: l and (l["score"] >= OK, l["how"] == "number", l["score"]))
        out.append({"seq": h["seq"], "n": h["n"], "label": h["label"], "vol": h["vol"], "page": h["page"],
                    "maqsad": h["maqsad"], "kitab": h["kitab"], "fasl": h["fasl"], "bab": h["bab"],
                    "sub": h["sub"], "sym": h["sym"], "grade": h["grade"],
                    "status": status, "primary": primary and primary["key"], "links": links})
        if status in ("weak", "unlinked"):
            review.append("\t".join([h["label"], f"{h['vol']}/{h['page']}", status,
                                     " ".join(f"{l['sym']}{l['cited']}→{l['key']}({l['score']})" for l in links),
                                     h["refs_raw"][:80], h["text"][:120]]))
    (RAW / "maalim_links.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
    (RAW / "maalim_links_review.tsv").write_text(
        "رقم\tالجزء/الصفحة\tالحالة\tالمرشحون\tالإحالة\tالنص\n" + "\n".join(review) + "\n")
    hows = Counter(l["how"] for h in out for l in h["links"] if l["score"] >= OK or l["how"] == "number-weak")
    by_book = Counter(l["sym"] for h in out for l in h["links"] if l["score"] >= OK or l["how"] == "number-weak")
    print(f"{dict(stat)}\nmethods {dict(hows)}\nlinked refs by book {dict(by_book)}", file=sys.stderr)


if __name__ == "__main__":
    main()
