"""One-off: compile the kitab table of contents of the two Sahihs -> pipeline/toc/{bukhari,muslim}.json

The Ifta data gives each hadith its bab and its customary number, but not its kitab.
The kitab headings are al-Bukhari's and Muslim's own, so we store them once as a small
fixed table: [[first hadith number, kitab title], ...] in book order.
  * Bukhari: kitab boundaries by Fath al-Bari number (same numbering in both datasets).
  * Muslim:  each Ifta bab is matched to its kitab by the bab title in MIDS, then the
             first Abd al-Baqi number of every kitab is recorded.
Rows are [first mainId, first hadith number, kitab title]: the platform's mainId runs in book
order, whereas Abd al-Baqi's numbers can repeat (2675 opens both الذكر and التوبة).
Needs data/work/bukhari.json and data/work/muslim.json (load_bukhari.py / load_muslim.py).
"""
import json
from pathlib import Path

from common import RAW, WORK, dump, load, norm

TOC = Path(__file__).resolve().parent / "toc"


def ifta(book):
    return json.load(open(RAW / "ifta" / "original" / f"{book}.json", encoding="utf-8"))


def bukhari():
    """Main kitabs only: sub-sections (أبواب ...، سورة ... inside the tafsir) stay under their kitab."""
    first_main = {}
    for h in ifta("sahih-al-bukhari"):
        if h["hadith_num"]:
            first_main.setdefault(int(h["hadith_num"]), h["mainId"])
    rows, seen = [], set()
    for h in load(WORK / "bukhari.json")["hadiths"]:
        cats = h.get("categories") or []
        kitab = cats[1].strip() if len(cats) > 1 else ""
        if (kitab.startswith("كتاب") or kitab == "بدء الوحي") and kitab not in seen:
            rows.append([first_main[h["num"]], h["num"], kitab])
            seen.add(kitab)
    return rows


def muslim():
    mids = load(WORK / "muslim.json")["hadiths"]
    bab_kitab = {}
    for h in mids:
        bab_kitab.setdefault(norm(h["bab"]), (h["kitab_no"], h["kitab"]))
    hadiths = ifta("sahih-muslim")
    # kitabs only move forward in MIDS order, so a bab title shared by two kitabs cannot jump back
    rows, current = [[hadiths[0]["mainId"], 0, "المقدمة"]], 1
    titles = set()
    for h in hadiths:
        if not h["hadith_num"]:
            continue
        chapter = h["chapter"].strip()
        # a kitab without babs carries its own title in the bab field (e.g. كتاب اللعان)
        if norm(chapter).startswith("كتاب") and norm(chapter) not in titles:
            rows.append([h["mainId"], int(h["hadith_num"]), chapter])
            titles.add(norm(chapter))
            continue
        hit = bab_kitab.get(norm(chapter))
        if hit and hit[0] > current and norm(hit[1]) not in titles:
            rows.append([h["mainId"], int(h["hadith_num"]), hit[1]])
            titles.add(norm(hit[1]))
            current = hit[0]
    return rows


def main():
    for name, rows in (("bukhari", bukhari()), ("muslim", muslim())):
        dump(rows, TOC / f"{name}.json", pretty=True)
        print(name, len(rows), "kitabs:", " | ".join(k for *_, k in rows))


if __name__ == "__main__":
    main()
