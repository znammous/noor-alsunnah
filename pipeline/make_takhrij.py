"""The program's takhrij of each hadith, book by book -> site/data/t/ and site/data/x/

Runs after build_site.py (it reads meta.json for the shard of each hadith).

  t/<shard>.json   per hadith, in the order of its spread: [book name, [ref, ...]], where a ref is
                   the site key of a hadith of the nine books, or the program's mainId of a hadith
                   in one of the other books of the dataset (books outside the dataset, such as
                   تحفة الأشراف, get an empty list: the program names them without their text)
  x/<chunk>.json   mainId -> [book id, hadith number, text] of those other books, mainId // 500
"""
import json
import re
from collections import defaultdict

from common import RAW, SITE_DATA, WORK, dump, load
from ifta_load import BOOKS, clean, read_book, split_notes

SRC = RAW / "ifta" / "original"
CACHE = WORK / "slim" / "other"
CHUNK = 500
# program book id -> Ifta file slug, for the books of the dataset beyond the nine
OTHER = {
    10: "sahih-ibn-hibban", 11: "sahih-ibn-khuzaymah", 12: "al-mujam-al-kabir", 13: "al-mujam-al-awsat",
    14: "al-mujam-al-saghir", 15: "musannaf-ibn-abi-shaybah", 16: "musannaf-abd-al-razzaq",
    17: "sunan-al-bayhaqi-al-kubra", 18: "sunan-al-daraqutni", 19: "musnad-al-bazzar", 20: "musnad-al-humaydi",
    21: "musnad-al-tayalisi", 22: "al-sunan-al-kubra", 23: "musnad-abi-yala-al-mawsili",
    24: "al-mustadrak-ala-al-sahihayn", 25: "al-ahadith-al-mukhtarah", 26: "al-matalib-al-aliyah",
    27: "al-muntaqa", 28: "sharh-maani-al-athar", 29: "musnad-abd-ibn-humayd", 30: "sunan-said-ibn-mansur",
    31: "sharh-mushkil-al-athar", 32: "al-marasil-li-abi-dawud", 33: "al-shamail-al-muhammadiyyah",
}


def text_of(rec):
    return split_notes(clean(rec.get("hadith_text_diac")))[0]


def other_book(slug):
    """mainId -> [hadith number, text] of a book, cached (the raw files are up to 900 MB)."""
    cache = CACHE / f"{slug}.json"
    if cache.exists() and cache.stat().st_mtime > (SRC / f"{slug}.json").stat().st_mtime:
        return {int(k): v for k, v in load(cache).items()}
    with open(SRC / f"{slug}.json", encoding="utf-8") as f:
        out = {r["mainId"]: [(r.get("hadith_num") or "").strip(), text_of(r)] for r in json.load(f)}
    dump(out, cache)
    return out


def main():
    meta = load(SITE_DATA / "meta.json")
    corpus = load(WORK / "corpus.json")
    main_to_key = {m: h["key"] for h in corpus["hadiths"] for m in h["main_ids"]}
    spread = {h["key"]: [b for b, _ in h["spread"]["books"]] for h in corpus["hadiths"]}

    # every record's takhrij, gathered per hadith and per book name (as the spread counts them)
    refs = defaultdict(lambda: defaultdict(dict))
    nine_text = {}
    for book, (slug, *_rest) in BOOKS.items():
        original, _ = read_book(slug)
        for rec in original:
            key = main_to_key.get(rec["mainId"])
            if not key:
                continue
            for book_id, name, main_id in rec["takhreej"]:
                group = re.sub(r"\s+في\s+.*$", "", name or "").strip() or str(book_id)
                refs[key][group][main_id] = book_id
        for rec in original:
            nine_text[rec["mainId"]] = [(rec.get("hadith_num") or "").strip(), text_of(rec)]

    wanted = defaultdict(set)
    for groups in refs.values():
        for ids in groups.values():
            for m, b in ids.items():
                if m not in main_to_key and (b in OTHER or b <= 9):
                    wanted[b].add(m)
    texts, missing = {}, 0
    for b in sorted(wanted):
        data = nine_text if b <= 9 else other_book(OTHER[b])
        for m in wanted[b]:
            if m in data:
                texts[m] = [b, *data[m]]
            else:
                missing += 1
        print(f"book {b}: {len(wanted[b])} referenced, {sum(m in data for m in wanted[b])} with text")

    def num(n):
        return int(re.match(r"\d*", n).group(0) or 10 ** 7)

    order = {k: i for i, k in enumerate(meta["index"])}
    shards = defaultdict(dict)
    for key, groups in refs.items():
        if key not in meta["index"]:
            continue
        row = []
        for group in spread[key]:
            ids = groups.get(group, {})
            internal = sorted({main_to_key[m] for m in ids if m in main_to_key}, key=order.get)
            external = sorted((m for m in ids if m in texts), key=lambda m: (texts[m][0], num(texts[m][1]), m))
            row.append([group, internal + external])
        shards[meta["gshard"][meta["index"][key][1]]][key] = row
    for s, content in shards.items():
        dump(content, SITE_DATA / "t" / f"{s}.json")
    chunks = defaultdict(dict)
    for m, t in texts.items():
        chunks[m // CHUNK][m] = t
    for c, content in chunks.items():
        dump(content, SITE_DATA / "x" / f"{c}.json")
    print(f"{sum(map(len, shards.values()))} hadiths, {len(texts)} texts in {len(chunks)} chunks, {missing} missing")


if __name__ == "__main__":
    main()
