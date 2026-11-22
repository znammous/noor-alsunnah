#!/usr/bin/env python3
"""تحويل نص «معالم السنة النبوية» (الناتج من OCR) إلى بيانات منظمة.

المدخل: data/raw/maalim/ocr_{1,2,3}.txt  (كل صفحة تبدأ بسطر «=== page N»)
المخرج: data/raw/maalim/maalim.json      (الأحاديث مع المقصد والكتاب والفصل والباب
         والرمز والنص والإحالات والحكم)، و maalim_pages.json (الحواشي لكل صفحة).
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw" / "maalim"

AR2EN = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")
DIAC = re.compile(r"[ؐ-ًؚ-ٰٟۖ-ۭـ]")
D = "[٠-٩]"
DASH = r"\s*[-_–—]\s*"

# رموز الكتب كما في مقدمة المؤلف (وأشكال OCR الشائعة لها)
BOOKS = {
    "خ": "البخاري", "م": "مسلم", "د": "أبو داود", "دا": "أبو داود",
    "ت": "الترمذي", "ن": "النسائي", "جه": "ابن ماجه", "مي": "الدارمي",
    "حم": "أحمد", "ط": "الموطأ", "مه": "ابن خزيمة", "حب": "ابن حبان",
    "ك": "المستدرك", "هق": "البيهقي", "مخ": "المختارة",
}
REFSYM = "|".join(sorted(BOOKS, key=len, reverse=True))
SYMS = {"ق": "متفق عليه", "خ": "البخاري", "م": "مسلم"}


def num(s):
    return int(s.translate(AR2EN))


def bare(s):
    return DIAC.sub("", s)


# ---------- إصلاح رمز ﷺ ----------
GLYPH = set("ولعفيهمقخجكاتنلُ")
REAL = {"في", "لهم", "فيه", "فيهم", "وفي", "لم", "لي", "وهو",
        "ولا", "لا", "وهي", "فلم", "فقال", "وقال", "قال", "فيها", "لها",
        "عن", "على", "مع", "من", "ما", "أن", "إن", "كان", "وكان", "يقول", "عليه", "ولم",
        "فيما", "لك", "لكم", "منه", "كما", "قام", "والله", "ثم"}


def glyphy(tok, maxlen=6):
    b = bare(tok).strip(".,:،؛")
    return 1 <= len(b) <= maxlen and set(b) <= GLYPH and b not in REAL


def fix_salla(line):
    toks = line.split(" ")
    out, i = [], 0
    while i < len(toks):
        t = toks[i]
        if out and _is_prophet(out) and glyphy(t) and (
                bare(t)[:1] in "ول" or len(bare(t)) >= 3):
            b = bare(t)
            trail = re.search(r"[.,:،؛]+$", t)
            i += 1
            # قطعة ثانية قصيرة من الرمز نفسه (مثل: وَل لِ)
            if len(b) <= 2 and i < len(toks) and glyphy(toks[i], 3) and bare(toks[i]) != "في":
                trail = re.search(r"[.,:،؛]+$", toks[i])
                i += 1
            out.append("ﷺ" + (trail.group(0) if trail else ""))
            continue
        out.append(t)
        i += 1
    return " ".join(out)


def _is_prophet(out):
    last = bare(out[-1])
    two = bare(" ".join(out[-2:]))
    return last in ("النبي", "للنبي", "والنبي", "بالنبي") or two.endswith(
        ("رسول الله", "رسول اله", "رسول الل", "رسول اللّه"))


# ---------- قراءة الصفحات ----------
def read_pages(vol):
    pages, cur = [], None
    for line in (RAW / f"ocr_{vol}.txt").read_text().splitlines():
        m = re.match(r"=== page (\d+)", line)
        if m:
            cur = {"vol": vol, "page": int(m.group(1)), "lines": []}
            pages.append(cur)
        elif line.strip():
            cur["lines"].append(line.strip())
    return pages


MAQ = re.compile(r"^المقصد\s+(\S+)\s*:\s*([^٠-٩]+?)\s*(?:(" + D + r"+" + DASH + r"كتاب.*))?$")
KIT = re.compile(r"^(" + D + r"+)" + DASH + r"(كتاب[^/]+?)\s*(?:/\s*(.+))?$")
PAGENO = re.compile(r"^" + D + r"{1,3}$")
FOOT = re.compile(r"^(?:\(ت\)|\(" + D + r"+\)|" + D + r"+\s*[-_]$|" + D + r"+\)\s*[-_]|\(?" + D + r"+\)?\s*[-_]?\s*\(?" + D + r"+\))")


STRONG_FOOT = re.compile(r"^(?:\(ت\)|\(?" + D + r"+\)\s*[-_]?\s*\(?" + D + r"+\)|" + D + r"+\s*[-_]\s*\(ت\))")


def split_page(p, state):
    """يفصل رأس الصفحة والحواشي عن المتن، ويحدّث المقصد والكتاب والفصل."""
    lines = p["lines"]
    body, i = [], 0
    # رأس الصفحة: رقم الصفحة، المقصد، الكتاب/الفصل (أول أربعة أسطر)
    while i < min(4, len(lines)):
        l = lines[i]
        m = MAQ.match(l)
        if PAGENO.match(l):
            i += 1
            continue
        if m:
            state["maqsad"] = m.group(2).strip()
            if m.group(3):
                l = m.group(3)
            else:
                i += 1
                continue
        k = KIT.match(l)
        if k and ("باب" not in l):
            state["kitab"] = k.group(2).strip()
            state["kitab_no"] = num(k.group(1))
            if k.group(3):
                state["fasl"] = k.group(3).strip()
            i += 1
            continue
        break
    rest = lines[i:]
    # الحواشي: سطر حاشية صريح («(ت)»، «(١)»، «١) - ٢١٧)»، «=» تتمة حاشية سابقة) وما يليه
    # إلى أن يظهر سطر إحالة أو حكم أو بداية حديث أو باب
    last_ref = max([j for j, l in enumerate(rest) if l.startswith(("[", "•"))], default=-1)
    body, foot, infoot = [], [], False
    for j, l in enumerate(rest):
        strong = l.startswith("=") and j < 3 or STRONG_FOOT.match(l) or (j > last_ref and FOOT.match(l))
        if strong:
            infoot = True
        elif infoot and (l.startswith(("[", "•")) or HAD.match(l) or BAB.match(l)):
            infoot = False
        (foot if infoot else body).append(l)
    body = [l for l in body if not PAGENO.match(l)]
    # صفحات العناوين الفاصلة (المقصد/الكتاب الأول …) لا متن فيها
    if len(lines) <= 5 and any(re.match(r"^(?:ال)?(?:كتاب|الكِتَابُ|المقصد)", bare(l)) or "الكتاب" in bare(l) for l in lines):
        return [], []
    foot = [f for f in foot if not PAGENO.match(f)]
    return body, foot


def parse_refs(s):
    out = []
    # قوس الإحالة المقروء حرفًا: «لم ١١٢١»، «رك٨٥٩٨»، «إن ٣١٣٤»
    s = re.sub(r"(^|[\s\]\[/])[لرإا](?=(?:" + REFSYM + r")\s*\(?[٠-٩])", r"\1[", s)
    for m in re.finditer(r"(?<![ء-ي])(" + REFSYM + r")\s*\.?\s*:?\s*\(?([٠-٩0-9][٠-٩0-9 ()،,/]*)", s):
        out.append({"book": BOOKS[m.group(1)], "sym": m.group(1),
                    "nums": [num(x) for x in re.findall(r"[٠-٩0-9]+", m.group(2))]})
    return out


GRADE_WORDS = ("صحيح", "حسن", "إسناده", "ضعيف", "قال", "رجاله", "موقوف", "مرسل",
               "حديث", "صحي", "حسر", "منقطع", "لم", "سكت", "على شرط")


def is_grade(l):
    t = l.lstrip("• ").strip()
    return len(t) < 120 and not t.startswith(("وزاد", "وفي رواية", "وفي لفظ", "ولـ", "ولهما", "ولمسلم", "وللبخاري")) \
        and "(" not in t[:3] and any(t.startswith(w) or w in t[:25] for w in GRADE_WORDS)


HAD = re.compile(r"^(" + D + r"{1,4})" + DASH + r"(?:\((ق|خ|م)\)\s*)?(.*)$")
BAB = re.compile(r"^(" + D + r"{1,3})" + DASH + r"باب\s*:?\s*(.*)$")
UNNUM = re.compile(r"^((?:[•٠-٩]*\s*[-_]\s*)?)(?:\((ق|خ|م)\)\s*)?(?=عَ?نْ?\s|عن\s)")
FASL = re.compile(r"^الفصل\s+(?:ال)?\S+\s*:?\s*(.*)$")
INLINE_REF = re.compile(r"[\[(]\s*(?:" + REFSYM + r")\s*\.?\s*\(?[٠-٩0-9][^\]\[]{0,80}?\](?:\s*\[[^\]]{1,80}\])*")
# إحالة في آخر النص فُقد قوسها أو قُرئ «ل»/«ر»: «لم ١١٢١»، «رد ٤٢٩ ١]»
_R1 = r"[\[(لرإا]?\s*(?:" + REFSYM + r")\s*\.?\s*\(?[٠-٩][٠-٩ ()،,/]*"
TAIL_REF = re.compile(r"\s(" + _R1 + r"(?:[/\]]?\s*" + _R1 + r")*\]?)\s*(•?\s*(?:إسناده|صحيح|حسن|ضعيف)[^()]{0,60})?$")


def main():
    hadith, pages_out, state = [], [], {"maqsad": None, "kitab": None, "kitab_no": None,
                                         "fasl": None, "bab": None, "sub": None}
    expected, cur = 1, None
    pending_fasl = bab_cont = False
    for vol in (1, 2, 3):
        for p in read_pages(vol):
            if any(l.startswith("فهرس الجزء") for l in p["lines"][:4]):
                break
            body, foot = split_page(p, state)
            if foot:
                pages_out.append({"vol": vol, "page": p["page"], "notes": [fix_salla(f) for f in foot]})
            for l in body:
                bl = bare(l)
                if bab_cont:
                    bab_cont = False
                    if not (HAD.match(l) or l.startswith(("•", "[", "(")) or UNNUM.match(l) and l[:1] != "ع") and len(l) < 50:
                        state["bab"] += " " + l
                        continue
                if re.match(r"^الكتاب\s+\S+", bl) and len(l) < 60:
                    continue
                if re.match(r"^" + D + r"+" + DASH + r"إحالات\s*\.?$", l):
                    state["bab"], state["sub"] = "إحالات", None
                    continue
                if (l.startswith("سورة ") or l.startswith("قوله تعال")) and len(l) < 160:
                    state["sub"] = (state["sub"] + " " + l) if l.startswith("قوله") and state.get("sub") else l
                    continue
                if pending_fasl:
                    state["fasl"] = l
                    pending_fasl = bab_cont = False
                    continue
                f = FASL.match(bare(l))
                if f and len(l) < 60:
                    if f.group(1):
                        state["fasl"] = l.split(None, 2)[2].lstrip(": ") if len(l.split(None, 2)) > 2 else f.group(1)
                    else:
                        pending_fasl = True
                    continue
                b = BAB.match(l)
                if b:
                    state["bab"] = b.group(2).strip()
                    state["bab_no"] = num(b.group(1))
                    state["sub"] = None
                    bab_cont = True
                    continue
                h = HAD.match(l)
                if h and state["bab"] and expected <= num(h.group(1)) <= expected + 3 and (
                        h.group(2) or re.match(r"^(?:وَ?عَ?نْ?|عن|أَ?نَّ|قَالَ|كَانَ|\()", bare(h.group(3)) or h.group(3))
                        or num(h.group(1)) == expected):
                    n = num(h.group(1))
                    cur = {"n": n, "vol": vol, "page": p["page"], "pages": [p["page"]],
                           "maqsad": state["maqsad"], "kitab": state["kitab"],
                           "fasl": state["fasl"], "bab": state["bab"], "sub": state["sub"],
                           "sym": h.group(2), "text": [h.group(3)], "refs_raw": [],
                           "grade": [], "extra": []}
                    hadith.append(cur)
                    expected = n + 1
                    continue
                # حديث سقط رقمه في OCR: «• - عن …» أو «(ق) عن …» بعد إحالات الحديث السابق
                u = UNNUM.match(l)
                if u and cur is not None and cur["refs_raw"] and state["bab"]:
                    l = f"{expected} - " + l[u.end(1):].lstrip()
                    n = expected
                    cur = {"n": n, "vol": vol, "page": p["page"], "pages": [p["page"]],
                           "maqsad": state["maqsad"], "kitab": state["kitab"],
                           "fasl": state["fasl"], "bab": state["bab"], "sub": state["sub"],
                           "sym": u.group(2), "text": [l.split(" - ", 1)[1].removeprefix(f"({u.group(2)})").strip() if u.group(2) else l.split(" - ", 1)[1]],
                           "refs_raw": [], "grade": [], "extra": [], "num_guessed": True}
                    hadith.append(cur)
                    expected = n + 1
                    continue
                if cur is None:
                    continue
                if p["page"] not in cur["pages"]:
                    cur["pages"].append(p["page"])
                if l.startswith("[") and (parse_refs(l) or "انظر" in l):
                    cur["refs_raw"].append(l)
                elif l.startswith("•") and is_grade(l):
                    cur["grade"].append(l.lstrip("• ").strip())
                elif cur["refs_raw"] and not l.startswith("•") and re.match(r"^(وانظر|انظر)", bare(l)):
                    cur["refs_raw"].append(l)
                else:
                    (cur["extra"] if cur["refs_raw"] else cur["text"]).append(l)
    out = []
    for h in hadith:
        text = " ".join(h["text"])
        # إحالات ملتصقة بآخر سطر النص
        for m in list(INLINE_REF.finditer(text)):
            h["refs_raw"].insert(0, m.group(0))
        text = INLINE_REF.sub("", text).strip()
        t = TAIL_REF.search(text)
        if t:
            h["refs_raw"].insert(0, t.group(1))
            if t.group(2):
                h["grade"].insert(0, t.group(2).lstrip("• ").strip())
            text = text[:t.start()]
        g = re.search(r"\s*•\s*([^•]{2,80})$", text)
        if g and is_grade(g.group(1)):
            h["grade"].insert(0, g.group(1).strip())
            text = text[:g.start()]
        text = fix_salla(text.strip())
        extra = fix_salla(" ".join(h["extra"])) if h["extra"] else None
        refs = []
        for r in h["refs_raw"]:
            refs += parse_refs(r)
        out.append({
            "n": h["n"], "vol": h["vol"], "page": h["page"], "pages": h["pages"],
            "maqsad": h["maqsad"], "kitab": h["kitab"], "fasl": h["fasl"], "bab": h["bab"], "sub": h.get("sub"),
            "sym": h["sym"], "sym_name": SYMS.get(h["sym"]),
            "text": text, "extra": extra,
            "refs": refs, "refs_raw": " ".join(h["refs_raw"]),
            "grade": " | ".join(h["grade"]) or None,
            "num_guessed": h.get("num_guessed", False),
        })
    (RAW / "maalim.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
    (RAW / "maalim_pages.json").write_text(json.dumps(pages_out, ensure_ascii=False, indent=1))
    nums = {h["n"] for h in out}
    missing = [i for i in range(1, 3922) if i not in nums]
    print(f"hadith: {len(out)}  missing: {len(missing)} {missing[:40]}", file=sys.stderr)


if __name__ == "__main__":
    main()
