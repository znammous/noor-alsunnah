"""Sahihayn from «الجامع — Hadith Knowledge Graph» (CC BY 4.0) -> data/work/corpus.json

The knowledge graph gives unified narrator ids across 425 books, a grade for every
narrator, a mechanical judgement for every isnad and meaning groups across all books.
It lacks the book structure (كتاب / باب) and the customary numbering, which we take
from the other two sources by aligning the hadiths in book order:
  * Bukhari: hatemben/hadithdb (Fath al-Bari numbering, kitab/bab)   -> data/work/bukhari.json
  * Muslim:  MIDS (kitab/bab)                                         -> data/work/muslim.json
"""
import sqlite3
from collections import Counter, defaultdict

from common import RAW, WORK, dump, load, norm

DB = RAW / "hadith-kg" / "hadith-kg.db"
BOOKS = {1: "bukhari", 2: "muslim"}
AUTHOR_IDS = {"bukhari": None, "muslim": None}   # filled from pos 0 of the chains
RARE_DF = 25


def connect():
    con = sqlite3.connect(f"file:{DB}?mode=ro&immutable=1", uri=True)
    con.row_factory = sqlite3.Row
    return con


def tokens(text):
    return set(norm(text).split())


def align_order(kg_hadiths, src_hadiths):
    """Match each kg hadith to its best source hadith (via rare shared words), then keep the
    longest chain of matches that is increasing in both books, so book order is respected.
    Returns {kg index: src index}."""
    src_tokens = [tokens(h["text"]) for h in src_hadiths]
    df = Counter(t for u in src_tokens for t in u)
    index = defaultdict(list)
    for j, u in enumerate(src_tokens):
        for t in u:
            if df[t] <= RARE_DF:
                index[t].append(j)

    pairs = []
    for i, h in enumerate(kg_hadiths):
        t = tokens(h["text"])
        cands = Counter(j for w in t if df.get(w, 0) <= RARE_DF for j in index.get(w, ()))
        best, best_s = None, 0.0
        for j, _ in cands.most_common(15):
            u = src_tokens[j]
            sim = len(t & u) / (min(len(t), len(u)) or 1)
            if sim > best_s:
                best, best_s = j, sim
        if best is not None and best_s >= 0.6:
            pairs.append((i, best))

    # longest increasing subsequence on the source index (pairs are already sorted by i)
    tails, prev, tail_idx = [], [-1] * len(pairs), []
    for p, (_, j) in enumerate(pairs):
        lo, hi = 0, len(tails)
        while lo < hi:
            mid = (lo + hi) // 2
            if tails[mid] < j:
                lo = mid + 1
            else:
                hi = mid
        if lo == len(tails):
            tails.append(j)
            tail_idx.append(p)
        else:
            tails[lo] = j
            tail_idx[lo] = p
        prev[p] = tail_idx[lo - 1] if lo else -1
    keep, p = [], tail_idx[-1] if tail_idx else -1
    while p >= 0:
        keep.append(pairs[p])
        p = prev[p]
    return dict(keep)


def main():
    con = connect()
    cur = con.cursor()

    hadiths = []
    for book_id, book in BOOKS.items():
        rows = cur.execute(
            "select id, no_inbook, type, matn, group_id, takhrij, nass, matn_start, matn_end "
            "from hadiths where book_id=? order by no_inbook", (book_id,)).fetchall()
        for r in rows:
            hadiths.append({
                "id": r["id"], "book": book, "src_no": r["no_inbook"], "type": r["type"], "hukm": r["matn"],
                "group": r["group_id"], "takhrij": r["takhrij"], "text": r["nass"],
                "matn": [r["matn_start"], r["matn_end"]] if r["matn_start"] is not None else None,
            })
    by_id = {h["id"]: h for h in hadiths}

    # chains: pos 0 = author, ascending to the companion -> store top-down without the author
    chains = defaultdict(list)
    q = ("select s.id sid, s.hadith_id hid, s.matn, s.hukum, s.max_rank, sr.pos, sr.rawi_id "
         "from sanads s join sanad_rawis sr on sr.sanad_id = s.id "
         "join hadiths h on h.id = s.hadith_id where h.book_id in (1, 2) order by s.id, sr.pos")
    current = None
    for r in cur.execute(q):
        if current is None or current["sid"] != r["sid"]:
            current = {"sid": r["sid"], "hid": r["hid"], "grade": r["matn"], "hukm": r["hukum"],
                       "max_rank": r["max_rank"], "ids": []}
            chains[r["hid"]].append(current)
        current["ids"].append(r["rawi_id"])
    authors = Counter()
    for hid, cs in chains.items():
        for c in cs:
            authors[(by_id[hid]["book"], c["ids"][0])] += 1
            c["ids"] = list(reversed(c["ids"][1:]))
    for (book, rid), _ in authors.most_common():
        AUTHOR_IDS[book] = AUTHOR_IDS[book] or rid
    for h in hadiths:
        h["chains"] = [{"ids": c["ids"], "grade": c["grade"], "hukm": c["hukm"], "max_rank": c["max_rank"]}
                       for c in chains.get(h["id"], [])]

    # inline narrator mentions (character offsets into the text) for clickable names
    mentions = defaultdict(list)
    for r in cur.execute("select hr.hadith_id, hr.rawi_id, hr.start, hr.end from hadith_rawis hr "
                         "join hadiths h on h.id = hr.hadith_id where h.book_id in (1, 2) order by hr.hadith_id, hr.seq"):
        if r["rawi_id"]:
            mentions[r["hadith_id"]].append([r["start"], r["end"], r["rawi_id"]])
    for h in hadiths:
        h["mentions"] = mentions.get(h["id"], [])

    # narrators in Sahihayn chains or mentions
    ids = {i for h in hadiths for c in h["chains"] for i in c["ids"]} | {m[2] for h in hadiths for m in h["mentions"]}
    ids.discard(None)
    narrators = {}
    marks = ",".join("?" * len(ids))
    for r in cur.execute(f"select * from rawis where id in ({marks})", list(ids)):
        narrators[r["id"]] = {k: r[k] for k in r.keys() if r[k] not in (None, "")}
    aqwal = defaultdict(lambda: defaultdict(list))
    for r in cur.execute(f"select a.rawi_id, al.shuhra, al.death_year, a.qawl from aqwal a join alems al on al.id = a.alem_id "
                         f"where a.rawi_id in ({marks}) order by al.death_year, a.id", list(ids)):
        aqwal[r["rawi_id"]][r["shuhra"]].append(r["qawl"].strip())
    for rid, by_alem in aqwal.items():
        if rid in narrators:
            narrators[rid]["aqwal"] = [[alem, says] for alem, says in by_alem.items()]

    # meaning groups across ALL 425 books: how widely each hadith was narrated
    gids = sorted({h["group"] for h in hadiths if h["group"]})
    groups = {}
    gmarks = ",".join("?" * len(gids))
    for r in cur.execute(f"select id, nass, matn_no, sahaba_qty from meaning_groups where id in ({gmarks})", gids):
        groups[r["id"]] = {"taraf": r["nass"], "hukm_no": r["matn_no"], "books": [], "n_hadith": 0, "n_sanad": 0}
    for r in cur.execute(f"select h.group_id g, b.name, count(distinct h.id) n, count(s.id) s from hadiths h "
                         f"join books b on b.id = h.book_id left join sanads s on s.hadith_id = h.id "
                         f"where h.group_id in ({gmarks}) group by 1, 2 order by 1, 3 desc", gids):
        g = groups[r["g"]]
        g["books"].append([r["name"], r["n"]])
        g["n_hadith"] += r["n"]
        g["n_sanad"] += r["s"]
    for r in cur.execute(f"select h.group_id g, count(distinct sr.rawi_id) c from hadiths h join sanads s on s.hadith_id = h.id "
                         f"join sanad_rawis sr on sr.sanad_id = s.id and sr.pos = s.length - 1 "
                         f"where h.group_id in ({gmarks}) group by 1", gids):
        groups[r["g"]]["n_companions"] = r["c"]

    # book structure + customary numbering from the other sources
    for book, src_file in (("bukhari", "bukhari.json"), ("muslim", "muslim.json")):
        kg = [h for h in hadiths if h["book"] == book]
        src = load(WORK / src_file)["hadiths"]
        mapping = align_order(kg, src)
        last = None
        for i, h in enumerate(kg):
            s = src[mapping[i]] if i in mapping else None
            if s:
                last = s
            ref = s or last
            if book == "bukhari":
                cats = (ref or {}).get("categories") or []
                h["kitab"] = cats[1] if len(cats) > 1 else ""
                h["bab"] = cats[-1] if len(cats) > 2 else ""
            else:
                h["kitab"] = (ref or {}).get("kitab", "")
                h["kitab_no"] = (ref or {}).get("kitab_no")
                h["bab"] = (ref or {}).get("bab", "")
            if s:
                h["std_no" if book == "bukhari" else "mids_no"] = s["num"]
        print(f"{book}: aligned {len(mapping)}/{len(kg)} hadiths to {src_file}")

    dump({"hadiths": hadiths, "narrators": narrators, "groups": groups, "authors": AUTHOR_IDS},
         WORK / "corpus.json")
    print(f"corpus: {len(hadiths)} hadiths, {sum(len(h['chains']) for h in hadiths)} chains, "
          f"{len(narrators)} narrators, {len(groups)} meaning groups; authors {AUTHOR_IDS}")


if __name__ == "__main__":
    main()
