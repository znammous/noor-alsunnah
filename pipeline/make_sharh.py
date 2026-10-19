"""The simplified explanations of the Encyclopedia of Translated Prophetic Hadiths (hadeethenc.com),
tied to the hadiths of the nine books -> pipeline/sharh/links.json  {hadith key: [encyclopedia ids]}

The encyclopedia names the books that narrate each hadith ("رواه البخاري ومسلم") but rarely their
numbers, and quotes the Prophet's words without the isnad. So each encyclopedia hadith is matched
by text: every hadith of the named books whose matn carries the quoted words, in order, gets it.

It also writes the explanations the site shows, in Arabic and in every fetched translation, to
site/data/sharh/<lang>/<bucket>.json, and the languages to pipeline/sharh/langs.json.
Run after fetch_hadeethenc.py and before build_site.py (which keeps site/data/sharh).
"""
import math
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

from common import RAW, SITE_DATA, WORK, dump, load, norm

OUT = Path(__file__).resolve().parent / "sharh"
SRC = RAW / "hadeethenc"

BUCKETS = 32
# the order the site offers the translations in: the languages of the most Muslims first
PRIORITY = ["ar", "ur", "bn", "id", "en", "fa", "tr", "ha", "fr", "ps", "hi", "sw", "ru", "ms", "ku", "kmr",
            "uz", "so", "prs", "tg", "az", "ky", "ug", "bs", "sq", "yo", "ff", "om", "wo", "ml", "ta", "es", "zh"]
ARABIC_NAMES = {
    "ar": "العربية", "ur": "الأردية", "bn": "البنغالية", "id": "الإندونيسية", "en": "الإنجليزية", "fa": "الفارسية",
    "tr": "التركية", "ha": "الهوسا", "fr": "الفرنسية", "ps": "البشتو", "hi": "الهندية", "sw": "السواحيلية",
    "ru": "الروسية", "ms": "الملايوية", "ku": "الكردية (السورانية)", "kmr": "الكردية (الكرمانجية)", "uz": "الأوزبكية",
    "so": "الصومالية", "prs": "الدرية", "tg": "الطاجيكية", "az": "الأذرية", "ky": "القرغيزية", "ug": "الأويغورية",
    "bs": "البوسنية", "sq": "الألبانية", "yo": "اليوروبا", "ff": "الفولانية", "om": "الأورومو", "wo": "الولوف",
    "ml": "المالايالامية", "ta": "التاميلية", "es": "الإسبانية", "zh": "الصينية"}
# languages written right to left (the encyclopedia's Kurdish "ku" is Sorani, in Arabic script)
RTL = {"ar", "ur", "fa", "ps", "prs", "ug", "ku"}
# how the encyclopedia names the books of the nine
NAMES = [("متفق علي", ("bukhari", "muslim")), ("البخاري", ("bukhari",)), ("مسلم", ("muslim",)),
         ("أبو داود", ("abudawud",)), ("أبي داود", ("abudawud",)), ("الترمذي", ("tirmidhi",)),
         ("النسائي", ("nasai",)), ("ابن ماجه", ("ibnmajah",)), ("أحمد", ("ahmad",)),
         ("مالك", ("muwatta",)), ("الدارمي", ("darimi",))]
# the companion who reports it: "عن عائشة رضي الله عنها قالت:"
INTRO = re.compile(r"^\s*عن [^:]{0,120}?(?:قال|قالت|يقول|أنه|أنها|أن)[^:]{0,30}?:")
REPORT = {"مرفوعا", "قال", "قالت", "ان", "انه", "انها", "انهما", "انهم", "يقول", "تقول"}
QUOTE = re.compile(r"«([^»]+)»")
NARRATION = re.compile(r"(?:وفي|وفى|في) (?:رواية|لفظ)[^:]{0,40}:|ول(?:مسلم|لبخاري|أحمد)[^:]{0,20}:")
# blessings and honorifics, which the books write inconsistently
FORMULAS = re.compile(r"صلي الله عليه وسلم|رضي الله (?:تعالي )?عن(?:ه|ها|هما|هم)|عليه السلام")
MIN_WORDS = 4      # shorter quotes match too many hadiths
MIN_SHARE = 0.75   # share of the quote's words the matn must carry
MIN_SHARE_SHORT = 0.9  # ... when the quote is short, since a few common words match anywhere
SHORT = 15
# a hadith with no explanation of its own gets that of the most similar encyclopedia hadith, shown
# as such, when the words they share in order carry this share of the encyclopedia text's weight
# (rare words weigh more, so formulas like "أن رسول الله ﷺ نهى عن" do not make two hadiths alike)
SIMILAR_MIN = 0.65


def books_of(attribution):
    out = set()
    # "رواه البخاري ومسلم" / "رواه أبو داود والترمذي وأحمد"; "صحيح مسلم" never occurs here
    for name, books in NAMES:
        if re.search(rf"(^|[\sو]){name}", attribution):
            out.update(books)
    return out


def clean_words(text):
    # norm() drops bracketed text, but the encyclopedia often quotes the hadith in (...)
    return FORMULAS.sub(" ", norm(re.sub(r"[()\[\]«»]", " ", text))).split()


def quote_words(h):
    """Ways to read the hadith for matching: the whole report after the companion who narrates it,
    each of its narrations ("وفي رواية: ..."), and each long quote of the Prophet's words. The quotes
    alone are not enough, as a short one may be a phrase that many hadiths share."""
    text, intro = h["hadeeth"], (h.get("hadeeth_intro") or "").strip()
    text = text[len(intro):] if intro and text.startswith(intro) else INTRO.sub("", text, count=1)
    words = clean_words(text)
    if words[:1] == ["عن"]:  # "عن أبي هريرة أن ..." with no colon
        cut = next((i for i, w in enumerate(words[:8]) if w in REPORT), None)
        if cut:
            words = words[cut + 1:]
    out = [words]
    for seg in NARRATION.split(text)[1:]:
        out.append(clean_words(seg))
    out += [ws for q in QUOTE.findall(h["hadeeth"]) if len(ws := clean_words(q)) >= SHORT]
    return [ws for ws in out if len(ws) >= MIN_WORDS]


def matn_words(h):
    out = []
    for p in h["parts"]:
        s, e = p["matn"] if p.get("matn") else (0, len(p["text"]))
        out += FORMULAS.sub(" ", norm(p["text"][s:e])).split()
    return out


def in_order_share(words, target, positions):
    """Best share of the quote's words found in target in order within a window little longer than
    the quote, so a reworded hadith or one that merely shares words with a long one scores low."""
    span = int(len(words) * 1.5) + 6
    starts = {i for w in words[:6] for i in positions.get(w, ())}
    best = 0
    for start in starts:
        pos, hit, end = start, 0, start + span
        for w in words:
            nxt = next((i for i in positions.get(w, ()) if pos <= i < end), None)
            if nxt is not None:
                hit, pos = hit + 1, nxt + 1
        best = max(best, hit)
    return best / len(words)


def positions_of(words):
    out = defaultdict(list)
    for i, w in enumerate(words):
        out[w].append(i)
    return out


def main():
    enc = load(SRC / "ar.json")
    corpus = load(WORK / "corpus.json")["hadiths"]
    by_book = defaultdict(list)
    for h in corpus:
        by_book[h["book"]].append((h["key"], matn_words(h)))
    # rare-word index per book: word -> hadith keys
    index = {b: defaultdict(set) for b in by_book}
    for b, rows in by_book.items():
        for k, ws in rows:
            for w in set(ws):
                index[b][w].add(k)
    pos_of = {k: positions_of(ws) for rows in by_book.values() for k, ws in rows}
    words_of = {k: ws for rows in by_book.values() for k, ws in rows}
    rel = {h["key"]: h["rel"] for h in corpus}

    links, stats, unmatched = defaultdict(list), Counter(), []
    for eid, h in sorted(enc.items(), key=lambda kv: int(kv[0])):
        books = books_of(h.get("attribution") or "")
        readings = [[w for w in ws if len(w) > 1] for ws in quote_words(h)]
        readings = [ws for ws in readings if len(ws) >= MIN_WORDS]
        if not books:
            stats["outside the nine books"] += 1
            continue
        if not readings:
            stats["quote too short"] += 1
            unmatched.append((eid, "short", h["hadeeth"][:80]))
            continue
        hits = []
        for b in books:
            for words in readings:
                # candidates: hadiths carrying the reading's rarest words
                rare = sorted(set(words), key=lambda w: (len(index[b].get(w, ())), w))[:3]
                cands = set().union(*(index[b].get(w, set()) for w in rare))
                for k in cands:
                    if k not in hits and in_order_share(words, words_of[k], pos_of[k]) >= (
                            MIN_SHARE_SHORT if len(words) < SHORT else MIN_SHARE):
                        hits.append(k)
        # the program's parallels of a matched hadith, in any of the nine books, when their text agrees
        for k in list(hits):
            for r in rel.get(k, ()):
                # stricter than above: a short parallel one word away may be another hadith
                # ("من قام رمضان" beside "من صام رمضان")
                if r not in hits and any(in_order_share(words, words_of[r], pos_of[r]) >= (
                        1 if len(words) < SHORT else MIN_SHARE) for words in readings):
                    hits.append(r)
                    stats["parallels added"] += 1
        if hits:
            stats["matched"] += 1
            stats["hadith links"] += len(hits)
            for k in hits:
                links[k].append(int(eid))
        else:
            stats["no match"] += 1
            unmatched.append((eid, h.get("attribution"), h["hadeeth"][:80]))
    OUT.mkdir(exist_ok=True)
    dump(dict(sorted(links.items())), OUT / "links.json")
    with open(OUT / "unmatched.tsv", "w", encoding="utf-8") as f:
        for row in unmatched:
            f.write("\t".join(re.sub(r"\s+", " ", str(x)) for x in row) + "\n")
    stats["hadiths with an explanation"] = len(links)
    similar = similar_links(enc, words_of, pos_of, links)
    dump(dict(sorted(similar.items())), OUT / "similar.json")
    stats["hadiths with a similar hadith's explanation"] = len(similar)
    print(dict(stats), file=sys.stderr)
    write_site({e for es in links.values() for e in es} | {e for e, _ in similar.values()})


def weighted_share(words, positions, weight):
    """Like in_order_share, but each word counts by its rarity."""
    span = int(len(words) * 1.5) + 6
    total = sum(weight(w) for w in words)
    best = 0
    for start in {i for w in words[:8] for i in positions.get(w, ())}:
        pos, hit, end = start, 0, start + span
        for w in words:
            nxt = next((i for i in positions.get(w, ()) if pos <= i < end), None)
            if nxt is not None:
                hit, pos = hit + weight(w), nxt + 1
        best = max(best, hit)
    return best / total


def similar_links(enc, words_of, pos_of, links):
    """{hadith key: [encyclopedia id, score]} for the hadiths with no explanation of their own."""
    index = defaultdict(set)
    for k, ws in words_of.items():
        for w in set(ws):
            index[w].add(k)
    n = len(words_of)
    weight = lambda w: math.log(n / len(index[w])) if w in index else math.log(n)
    best = {}
    for eid, h in sorted(enc.items(), key=lambda kv: int(kv[0])):
        for reading in quote_words(h):
            words = [w for w in reading if len(w) > 1]
            if len(words) < MIN_WORDS + 1:
                continue
            rare = sorted(set(words), key=lambda w: (len(index.get(w, ())), w))[:4]
            for k in set().union(*(index.get(w, set()) for w in rare)):
                if k in links:
                    continue
                score = weighted_share(words, pos_of[k], weight)
                if score >= SIMILAR_MIN and score > best.get(k, [0, 0])[1]:
                    best[k] = [int(eid), round(score, 2)]
    return best


def compact(h, lang):
    """The fields the site shows, with the encyclopedia's text of the hadith (in its own language)."""
    out = {"t": h["title"], "x": h["explanation"], "f": h.get("hints") or []}
    out["h"] = h["hadeeth"]
    if lang == "ar":
        out["w"] = [[(m["word"] or "").strip(), (m["meaning"] or "").strip()] for m in h.get("words_meanings") or []
                    if m.get("word") and m.get("meaning")]
    out["g"] = h.get("grade") or ""
    return {k: v for k, v in out.items() if v}


def write_site(used):
    names = {r["code"]: r["native"] for r in load(SRC / "languages.json")}
    root = SITE_DATA / "sharh"
    langs = []
    for lang in sorted((p.stem for p in SRC.glob("*.json") if p.stem in names),
                       key=lambda c: (PRIORITY.index(c) if c in PRIORITY else 99, c)):
        recs = {int(i): h for i, h in load(SRC / f"{lang}.json").items() if int(i) in used}
        buckets = defaultdict(dict)
        for i, h in recs.items():
            buckets[i % BUCKETS][i] = compact(h, lang)
        for b, rows in buckets.items():
            dump(rows, root / lang / f"{b}.json")
        label = names[lang] if lang == "ar" else f"{ARABIC_NAMES.get(lang, lang)} · {names[lang]}"
        langs.append([lang, label, len(recs), int(lang in RTL)])
        print(f"  {lang}: {len(recs)}", file=sys.stderr)
    dump({"buckets": BUCKETS, "langs": langs}, OUT / "langs.json")


if __name__ == "__main__":
    main()
