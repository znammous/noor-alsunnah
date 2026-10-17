"""Scholars' verdicts on the hadiths of the Sunan and Musnad al-Darimi, from the Shamela editions
-> pipeline/grades/<book>.json  {hadith number: [[source key, verdict, Shamela page id], ...]}

Pages come from fetch_shamela_pages.py. Each verdict is kept in its author's words and tied to
its source (GRADE_SOURCES in build_site.py), never merged into a verdict of our own:
* "[حكم الألباني]" in the footnotes of Abu Dawud, al-Tirmidhi and Ibn Majah (the Shamela team's
  transfer of al-Albani's «صحيح وضعيف السنن»);
* al-Busiri's «في الزوائد ...» as quoted by Muhammad Fu'ad Abd al-Baqi under Ibn Majah;
* "[تعليق المحقق]" after each hadith of al-Darimi (Husayn Salim Asad).
The editions are those whose numbering the program follows; a verdict is kept only when the
hadith under its number opens with the same words in the program (corpus.json from ifta_load.py).
"""
import json
import re
from collections import Counter

from pathlib import Path

from common import RAW, WORK, dump, load, norm

PAGES = RAW / "shamela" / "pages"
OUT = Path(__file__).resolve().parent / "grades"
ARABIC_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")

# book key -> Shamela book id
BOOKS = {"abudawud": 1726, "tirmidhi": 1435, "ibnmajah": 1198, "darimi": 21795}

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


def main():
    corpus = load(WORK / "corpus.json")["hadiths"]
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
