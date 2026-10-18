"""Ibn Hajar on al-Bukhari's narrators below صدوق, quoted from «هدي الساري» (Shamela 1673, its first
pages) -> pipeline/rijal/hady.json {narrator id: [page id, printed page, text]}.

Each entry of chapter nine starts with the sigla of the books, «(خ م ...) name»; it runs to the next one.
Needs data/raw/shamela/pages/1673.jsonl (fetch_shamela_pages.py 1673).
"""
import json
import re
from pathlib import Path

from common import RAW, strip_diacritics

HERE = Path(__file__).resolve().parent
# narrator id -> the start of his entry in chapter nine, as printed (diacritics aside). Each is checked by
# hand against the hadith the entry names: al-Bukhari's shaykh Shuja' b. al-Walid Abu al-Layth (2746)
# is not Abu Badr al-Kufi of chapter nine, though they share the name.
ENTRIES = {
    "66": "إبراهيم بن عبد الرحمن بن عبد الله بن أبي ربيعة",
    "543": "أسباط أبو اليسع",
    "714": "أسيد بن زيد الجمال",
    "6876": "يحيى بن أبي زكريا",
}
SIGLA = re.compile(r"\((?:[خمدتسقعأ٤]{1,3}\s?)+\)\s")


def main():
    pages = [json.loads(l) for l in open(RAW / "shamela" / "pages" / "1673.jsonl", encoding="utf-8")]
    pages = [p for p in pages if "body" in p and 380 <= p["id"] <= 455]   # chapter nine
    out = {}
    for nid, start in ENTRIES.items():
        for i, p in enumerate(pages):
            # the entry may run over to the next page
            text = p["body"] + ("\n" + pages[i + 1]["body"] if i + 1 < len(pages) else "")
            plain = strip_diacritics(text)
            at = plain.find(strip_diacritics(start))
            if at < 0 or at >= len(strip_diacritics(p["body"])):  # starts on the next page
                continue
            # positions in the plain text map back to the original through the kept characters
            kept = [j for j, ch in enumerate(text) if strip_diacritics(ch)]
            s = kept[at]
            s = text.rfind("(", 0, s)
            nxt = SIGLA.search(text, s + 5)
            entry = text[s:nxt.start() if nxt else len(text)].strip()
            out[nid] = [p["id"], p["num"], re.sub(r"\s+", " ", entry)]
            break
        else:
            raise SystemExit(f"not found: {nid} {start}")
    (HERE / "rijal" / "hady.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"hady: {len(out)} narrators")


if __name__ == "__main__":
    main()
