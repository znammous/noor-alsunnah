"""Sahih Muslim from MIDS (Multi-IsnadSet, CC BY 4.0) -> data/work/muslim.json

Narrator IDs in MIDS follow muslimscholars.info numbering; a "_1" suffix marks a
duplicate entry of the same person, so it is folded into the base ID.
Each chain is stored top-down: [companion, ..., Muslim's own shaykh].
"""
import re
from collections import defaultdict

import pandas as pd

from common import RAW, WORK, dump

SRC = RAW / "mids"


def base_id(v) -> str:
    return re.sub(r"_\d+$", "", str(v).strip())


def main():
    nodes = pd.read_excel(SRC / "nodes.xlsx")
    edges = pd.read_excel(SRC / "edges.xlsx")
    content = pd.read_excel(SRC / "content.xlsx")

    narrators = {}
    for r in nodes.itertuples(index=False):
        nid = base_id(r.NarratorID_Mapped)
        entry = narrators.setdefault(nid, {
            "id": nid,
            "name": str(r._3).strip(),          # NarratorNameAr-Mapped (short form)
            "full": str(r.NarratorNameAr).strip(),
            "en": str(r._4).strip(),
            "gender": "f" if str(r.Gender).lower().startswith("fa") or str(r.Gender) == "Female" else "m",
            "gen": str(r.NarratorGeneration).strip(),
        })
        # keep the cleaner variant (without editorial brackets) as the full name
        if "[" in entry["full"] and "[" not in str(r.NarratorNameAr):
            entry["full"] = str(r.NarratorNameAr).strip()

    edges = edges.assign(
        src=edges.sourceNarratorID.map(base_id),
        dst=edges.targetNarratorID.map(base_id),
        step=edges.intractionLabel.str.extract(r"-i(\d+)$")[0].astype(int),
    ).sort_values(["HadithNo", "SanadNo", "step"])

    chains = defaultdict(list)
    for (hno, sno), g in edges.groupby(["HadithNo", "SanadNo"], sort=False):
        chain = [g.iloc[0].src] + g.dst.tolist()
        # drop immediate repeats produced by data-entry noise
        chain = [x for i, x in enumerate(chain) if i == 0 or x != chain[i - 1]]
        chains[int(hno)].append(chain)

    hadiths = []
    for r in content.itertuples(index=False):
        hno = int(r.HadithNo)
        hadiths.append({
            "book": "muslim",
            "num": hno,
            "kitab_no": int(r.ChapterNo),
            "kitab": str(r.ChapterTitleAr).strip().rstrip(" ."),
            "bab": str(r.UnitTitleAr).strip().rstrip(" ."),
            "text": str(r.HadithText_Mushakkal).strip(),
            "chains": chains.get(hno, []),
        })

    missing = [n for h in hadiths for c in h["chains"] for n in c if n not in narrators]
    dump({"narrators": narrators, "hadiths": hadiths}, WORK / "muslim.json")
    print(f"muslim: {len(hadiths)} hadiths, {sum(len(h['chains']) for h in hadiths)} chains, "
          f"{len(narrators)} narrators, {len(set(missing))} unknown ids in chains")


if __name__ == "__main__":
    main()
