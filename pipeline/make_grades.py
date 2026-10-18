"""Scholars' verdicts on the hadiths of the Sunan and Musnad al-Darimi, from the Shamela editions
-> pipeline/grades/<book>.json  {hadith number: [[source key, verdict, Shamela page id], ...]}

Pages come from fetch_shamela_pages.py. Each verdict is kept in its author's words and tied to
its source (GRADE_SOURCES in build_site.py), never merged into a verdict of our own:
* "[حكم الألباني]" in the footnotes of Abu Dawud, al-Tirmidhi and Ibn Majah (the Shamela team's
  transfer of al-Albani's «صحيح وضعيف السنن»);
* al-Busiri's «في الزوائد ...» as quoted by Muhammad Fu'ad Abd al-Baqi under Ibn Majah;
* "[تعليق المحقق]" after each hadith of al-Darimi (Husayn Salim Asad).
These editions are those whose numbering the program follows; a verdict is kept only when the
hadith under its number opens with the same words in the program (corpus.json from ifta_load.py).

Al-Nasa'i's sources number the hadiths their own way (TEXT_BOOKS), so each of their hadiths is
matched to the program's by its text, in book order:
* al-Albani's «صحيح سنن النسائي» and «ضعيف سنن النسائي»: "(صحيح) - ..." after each hadith;
* the Risala edition (2018): the editors' verdict opening the hadith's footnote ("إسناده صحيح، ...").
"""
import json
import re
from bisect import bisect_right
from collections import Counter
from pathlib import Path

from common import RAW, WORK, dump, load, norm

PAGES = RAW / "shamela" / "pages"
OUT = Path(__file__).resolve().parent / "grades"
ARABIC_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")

# book key -> Shamela book id
BOOKS = {"abudawud": 1726, "tirmidhi": 1435, "ibnmajah": 1198, "darimi": 21795}
# book key -> [(Shamela book id, source key)], matched by text
TEXT_BOOKS = {"nasai": [(1147, "albani-sahih"), (1148, "albani-daif"), (1339, "risala")]}

TAG = re.compile(r"\[(حكم الألباني|تعليق محمد فؤاد عبد الباقي|شرح محمد فؤاد عبد الباقي|تعليق المحقق)\]\s*:?\s*")
START = re.compile(r"(?:^|\n|\])\s*(\d{1,5})\s*-\s")
PAGE_MARK = re.compile(r"⦗[^⦘]*⦘")


def blocks(text):
    """[(tag, text)] of the tagged notes in a page's text."""
    parts = TAG.split(text)
    return [(parts[i], parts[i + 1].strip()) for i in range(1, len(parts) - 1, 2)]


def tidy(s):
    s = PAGE_MARK.sub("", s)
    return re.sub(r"\s+", " ", s).strip(" .،:-")


def verdicts(tag, text):
    """[(source key, verdict)] carried by one tagged note."""
    if tag == "حكم الألباني":
        v = tidy(text.split("\n")[0])
        return [("albani", v)] if v else []
    if tag == "تعليق محمد فؤاد عبد الباقي":
        m = re.search(r"في الزوائد.*", text, re.S)
        return [("busiri", tidy(m.group(0)))] if m else []
    if tag == "تعليق المحقق":
        v = tidy(text.split("\n")[0])
        return [("asad", v)] if v and v != "لم يحكم عليه المحقق" else []
    return []


QUOTING = {"دون", "بزيادة", "بلفظ", "جملة", "بجملة"}
QUOTED_AFTER = {"قوله", "فعله", "قول", "و"}


def own_words(verdict, body):
    """The verdict without a tail copied from the book's own text: in a few places Shamela carries
    the compiler's remark after the hadith ("قال أبو داود: وهذا الحديث ليس بالمشهور ...") into the
    "[حكم الألباني]" line. -> (verdict, 1 if cut)"""
    words, plain = verdict.split(), norm(body)
    for k in range(1, len(words) - 3):
        # al-Albani quotes the hadith himself: "صحيح دون قوله ...", "منكر بزيادة ...", "من فعله ..."
        if QUOTING & set(words[:k]) or words[k - 1] in QUOTED_AFTER:
            continue
        if norm(" ".join(words[k:])) in plain:
            return " ".join(words[:k]), 1
    return verdict, 0


def starts(body, last):
    """Hadith numbers opening in a page body, in order, keeping only those that continue the count."""
    out = []
    for m in START.finditer(body.translate(ARABIC_DIGITS)):
        n = int(m.group(1))
        if last < n <= last + 40:
            out.append((m.start(1), n))
            last = n
    return out


def book_grades(book_id):
    lines = (PAGES / f"{book_id}.jsonl").read_text(encoding="utf-8").splitlines()
    pages = [json.loads(l) for l in lines]
    complete = bool(pages) and pages[-1].get("end")
    pages = [p for p in pages if not p.get("end")]
    grades, stats, last, opening = {}, Counter(), 0, {}

    def add(n, src, v, p):
        if n:
            row = [src, v, p["id"]]
            if row[:2] not in [r[:2] for r in grades.setdefault(str(n), [])]:
                grades[str(n)].append(row)

    for p in pages:
        body = p["body"].translate(ARABIC_DIGITS)
        here = starts(body, last)
        for pos, n in here:
            opening[n] = norm(body[pos:pos + 400]).split()[1:13]
        # notes inside the body (al-Darimi) belong to the hadith opened before them
        for m in TAG.finditer(body):
            owner = last
            for pos, n in here:
                if pos < m.start():
                    owner = n
            for src, v in verdicts(m.group(1), body[m.end():].split("\n")[0]):
                add(owner, src, v, p)
                stats["body"] += 1
        # footnotes: one note per hadith opened on the page, in order; with none, the running hadith's
        notes = [(tag, text) for tag, text in blocks(p["hamesh"]) if verdicts(tag, text)]
        albani = [b for b in notes if b[0] == "حكم الألباني"]
        owners = [n for _, n in here] or [last]
        if albani and len(albani) != len(owners):
            stats["footnotes not one per hadith"] += 1
            owners = ([last] + owners)[-len(albani):] if len(albani) > len(owners) else owners[-len(albani):]
        # a hadith's other notes come before its "[حكم الألباني]"
        i, pending = 0, []
        for tag, text in notes:
            pending += verdicts(tag, text)
            if tag == "حكم الألباني" or (tag, text) == notes[-1]:
                owner = owners[min(i, len(owners) - 1)]
                for src, v in pending:
                    if src == "albani":
                        v, cut = own_words(v, p["body"])
                        stats["albani: copied body text removed"] += cut
                    add(owner, src, v, p)
                    stats[src] += 1
                i, pending = i + (tag == "حكم الألباني"), []
        if here:
            last = here[-1][1]
    stats["hadiths numbered"] = last
    return grades, opening, stats, complete


def same_hadith(words, text):
    """Most of the opening words of the Shamela hadith occur in the program's text."""
    words = [w for w in words if len(w) > 2]
    return bool(words) and sum(w in text for w in words) >= 0.6 * len(words)


FOOTNOTE = re.compile(r"(?:^|\n)\((\d{1,2})\)\s*(.*?)(?=\n\(\d{1,2}\)|\Z)", re.S)
MARKER = re.compile(r"\((\d{1,2})\)")
ALBANI_INLINE = re.compile(r"(?:^|\n)\s*\(((?:صحيح|حسن|ضعيف|شاذ|منكر|موضوع)[^)]*)\)")
# the footnote that grades the hadith, not one on its manuscripts or its men
EDITORS_VERDICT = re.compile(r"^(?:إسناد|حديث|صحيح|حسن|ضعيف|رجال|أثر|مرفوع|موقوف|مرسل|منكر|شاذ)")


def segments(book_id):
    """The numbered hadiths of a source, in order: {n, text, page, notes (footnotes of its markers)}."""
    out, last = [], 0
    for line in open(PAGES / f"{book_id}.jsonl", encoding="utf-8"):
        p = json.loads(line)
        if p.get("end"):
            break
        body = p["body"].translate(ARABIC_DIGITS)
        notes = {m.group(1): m.group(2).strip() for m in FOOTNOTE.finditer(p["hamesh"].translate(ARABIC_DIGITS))}
        here = starts(body, last)
        bounds = [pos for pos, _ in here] + [len(body)]
        pieces = [(None, body[:bounds[0]])] + [(n, body[pos:bounds[i + 1]]) for i, (pos, n) in enumerate(here)]
        for n, text in pieces:
            if n is not None:
                out.append({"n": n, "text": "", "page": p["id"], "notes": []})
                last = n
            if out:
                out[-1]["text"] += "\n" + text
                out[-1]["notes"] += [notes.get(m.group(1), "") for m in MARKER.finditer(text)]
    return out


def first_clause(note):
    """The verdict at the head of an editor's footnote: "إسناده صحيح، جرير: هو ..." -> "إسناده صحيح",
    keeping a qualifying second clause ("حديث صحيح، وهذا إسناد ضعيف")."""
    parts = re.split(r"[،.؛]", tidy(note.split("\n")[0]))
    v = re.sub(r"\s+\S+(?:\s+\S+)?:\s*هو\b.*$", "", parts[0]).strip()   # "... أبو معاوية: هو ..." without a comma
    if len(parts) > 1 and re.match(r"\s*(?:و?لكن|وهذا إسناد|وإسناده|وهذا الإسناد|والصواب)", parts[1]):
        v += "، " + parts[1].strip()
    return v


def inline_verdict(inner):
    """al-Albani's verdict in "(صحيح: ق)", "(شاذ - بزيادة ... - صحيح أبي داود 909)": the verdict and
    its qualifier, without the references that follow it."""
    parts = re.split(r"\s+-\s+", inner)
    v = parts[0]
    if len(parts) > 1 and re.match(r"(?:بزيادة|دون|إلا|باستثناء|بلفظ|لكن|[خمق](?:\s|،|$))", parts[1]):
        v += " " + parts[1]
    v = re.split(r"\s*\[", v)[0]
    v = re.sub(r"،[^،]*\d.*$", "", v)                 # a reference after a comma: "، ضعيف أبي داود 176"
    v = re.sub(r"\s*\(\d*$", "", v)
    return tidy(re.sub(r"^(\S+(?: \S+)?):\s*([خمق])$", r"\1 \2", v))


def text_verdict(src, seg):
    """(verdict, text to match) of one hadith of a text-matched source."""
    if src.startswith("albani"):
        m = ALBANI_INLINE.search(seg["text"])
        if not m:
            return None, seg["text"]
        return inline_verdict(m.group(1)), seg["text"][:m.start()]
    graded = [n for n in seg["notes"] if EDITORS_VERDICT.match(n)]
    return (first_clause(graded[-1]) if graded else None), MARKER.sub(" ", seg["text"])


def align(segs, program, stats):
    """Match each hadith of a source to the program's. Candidates share its rarest words; among
    those matching about as well as the best, the one nearest after the previous match wins, as
    both follow the book's order and al-Nasa'i repeats a text under several chapters.
    -> [(program number, segment)]"""
    postings = {}
    for i, (_, words) in enumerate(program):
        for w in words:
            postings.setdefault(w, []).append(i)
    out, j = [], -1
    for seg in segs:
        words = [w for w in dict.fromkeys(norm(seg["match"]).split()) if len(w) > 2][:50]
        known = sorted((w for w in words if w in postings), key=lambda w: len(postings[w]))
        if len(words) < 4 or not known:
            stats["too short to match"] += 1
            continue
        scored = []
        for i in {i for w in known[:4] for i in postings[w]}:
            score = sum(w in program[i][1] for w in words) / len(words)
            if score >= 0.7:
                scored.append((score, i))
        if not scored:
            stats["no match in the program"] += 1
            continue
        top = max(sc for sc, _ in scored)
        j = min((i for sc, i in scored if sc >= top - 0.05), key=lambda i: (i <= j, abs(i - j)))
        out.append((j, seg))
    # keep the longest run of matches in book order; a match out of order is a near-identical text
    # elsewhere in the book (a repeated hadith), not this one
    keep = in_order([i for i, _ in out])
    stats["out of order, dropped"] += len(out) - len(keep)
    return [(program[out[k][0]][0], out[k][1]) for k in keep]


def in_order(seq):
    """Positions of a longest non-decreasing subsequence of seq."""
    tails, prev, ends = [], [None] * len(seq), []
    for k, x in enumerate(seq):
        lo = bisect_right(tails, x)
        if lo == len(tails):
            tails.append(x)
            ends.append(k)
        else:
            tails[lo], ends[lo] = x, k
        prev[k] = ends[lo - 1] if lo else None
    out, k = [], ends[-1] if ends else None
    while k is not None:
        out.append(k)
        k = prev[k]
    return out[::-1]


def text_book(book, sources, corpus):
    program = [(h["num"], set(norm(" ".join(p["text"] for p in h["parts"])).split()))
               for h in sorted((h for h in corpus if h["book"] == book), key=lambda h: int(h["num"]))]
    grades, stats = {}, Counter()
    for book_id, src in sources:
        segs = segments(book_id)
        for seg in segs:
            seg["verdict"], seg["match"] = text_verdict(src, seg)
        stats[f"{book_id} hadiths"] = len(segs)
        graded = [seg for seg in segs if seg["verdict"]]
        stats[f"{book_id} graded"] = len(graded)
        for num, seg in align(graded, program, stats):
            rows = grades.setdefault(num, [])
            if [src, seg["verdict"]] not in [r[:2] for r in rows]:
                rows.append([src, seg["verdict"], seg["page"]])
                stats[f"{book_id} matched"] += 1
    stats["hadiths graded"] = len(grades)
    return grades, stats


def main():
    corpus = load(WORK / "corpus.json")["hadiths"]
    for book, sources in TEXT_BOOKS.items():
        if not all((PAGES / f"{b}.jsonl").exists() for b, _ in sources):
            print(f"{book}: no pages yet")
            continue
        grades, stats = text_book(book, sources, corpus)
        dump(dict(sorted(grades.items(), key=lambda kv: int(kv[0]))), OUT / f"{book}.json")
        print(f"{book}: {dict(stats)}")
    for book, book_id in BOOKS.items():
        if not (PAGES / f"{book_id}.jsonl").exists():
            print(f"{book}: no pages yet")
            continue
        grades, opening, stats, complete = book_grades(book_id)
        text = {}
        for h in corpus:
            if h["book"] == book:
                t = norm(" ".join(p["text"] for p in h["parts"]))
                for n in [h["num"], *h["aliases"]]:
                    text[n] = t
        dropped = [n for n in grades if not same_hadith(opening.get(int(n), []), text.get(n, ""))]
        for n in dropped:
            del grades[n]
        stats["dropped (text differs)"] = len(dropped)
        stats["hadiths graded"] = len(grades)
        if dropped:
            print(f"  {book} dropped: {' '.join(dropped)}")
        dump(dict(sorted(grades.items(), key=lambda kv: int(kv[0]))), OUT / f"{book}.json")
        print(f"{book}{'' if complete else ' (partial)'}: {dict(stats)}")


if __name__ == "__main__":
    main()
