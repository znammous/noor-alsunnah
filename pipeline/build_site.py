"""Build the static site data from data/work/corpus.json -> site/data/

Layout (sharded to keep the file count low for static hosting):
  meta.json        books + kitabs, hadith index, narrator directory (light)
  stats.json       dashboard indicators
  search.json      normalised text for in-browser search (lazy loaded)
  g/<shard>.json   hadith groups (turuq): hadiths + chains + madar + spread in all books
  n/<shard>.json   narrator details: bio, jarh wa ta'dil, teachers, students, hadiths
"""
import re
from collections import Counter, defaultdict

from common import SITE_DATA, WORK, dump, load, norm, strip_diacritics

GROUP_SHARD = 50
NARR_SHARDS = 64
PROPHET, BUKHARI, MUSLIM = "nabi", "bukhari", "muslim"
COMPILER = {"bukhari": BUKHARI, "muslim": MUSLIM}
# placeholder "narrators" of the source: shown in trees, never counted as narrators
SPECIAL = {"30001": ("موضع تعليق", "taliq"), "1131": ("راوٍ مبهم", "mubham"), "9481": ("غير معرَّف", "mubham")}
PREFIX = {"bukhari": "b", "muslim": "m"}
TABAQA = {1: "الصحابة", 2: "كبار التابعين", 3: "الوسطى من التابعين", 4: "تلي الوسطى من التابعين",
          5: "صغار التابعين", 6: "عاصروا صغار التابعين", 7: "كبار أتباع التابعين", 8: "الوسطى من أتباع التابعين",
          9: "صغار أتباع التابعين", 10: "كبار الآخذين عن تبع الأتباع", 11: "الوسطى من الآخذين عن تبع الأتباع",
          12: "صغار الآخذين عن تبع الأتباع"}


def cls_of(rank_no):
    """Coarse colour class from the source's rank scale (1 صحابي ... 12 كذاب)."""
    if rank_no == 1:
        return "sahabi"
    if rank_no in (2, 3):
        return "thiqa"
    if rank_no in (4, 5):
        return "saduq"
    if rank_no in (6, 7):
        return "maqbul"
    if rank_no and rank_no >= 8:
        return "weak"
    return "unknown"


def chain_class(grade, hukm, ids=()):
    if "تعليق" in hukm or "30001" in ids:
        return "muallaq"
    return {"صحيح": "sahih", "حسن": "hasan", "ضعيف": "daif", "شديد الضعف": "daif"}.get(grade, "other")


def snippet(text, span=None, n=150):
    t = text[span[0]:span[1]] if span and span[0] is not None else text
    t = strip_diacritics(t).strip()
    return t[:n].strip() + ("…" if len(t) > n else "")


def main():
    C = load(WORK / "corpus.json")
    raw_nar = {str(k): v for k, v in C["narrators"].items()}
    author_ids = {str(v) for v in C["authors"].values()}

    # ---------- narrators ----------
    narr = {}
    for k, v in raw_nar.items():
        if k in author_ids:
            continue
        narr[k] = {
            "id": k,
            "name": (v.get("nickname") or v.get("name", "")).strip(),
            "full": v.get("name", "").strip(),
            "rank": v.get("rank", ""),
            "rank_no": v.get("rank_no"),
            "cls": cls_of(v.get("rank_no")),
            "tabaka": v.get("tabaka"),
            "birth": v.get("birth_year_raw"),
            "death": v.get("death_year_raw"),
            "death_year": v.get("death_year"),
            "nasab": v.get("nasab"),
            "iqama": v.get("iqama"),
            "death_place": v.get("death_place"),
            "tadlis": v.get("has_tadlis", 0),
            "ikhtilat": v.get("has_ikhtilat", 0),
            "shaykhayn": [x for x, f in (("bukhari", v.get("is_bukhari")), ("muslim", v.get("is_muslim"))) if f],
            "riwaya_qty": v.get("riwaya_qty"),
            "profession": v.get("profession"),
            "aqwal": v.get("aqwal", []),
            "stub": v.get("is_stub", 0),
        }
    for k, (label, cls) in SPECIAL.items():
        narr[k] = {"id": k, "name": label, "cls": cls}
    narr[PROPHET] = {"id": PROPHET, "name": "النبي ﷺ", "cls": "nabi"}
    narr[BUKHARI] = {"id": BUKHARI, "name": "الإمام البخاري", "cls": "imam"}
    narr[MUSLIM] = {"id": MUSLIM, "name": "الإمام مسلم", "cls": "imam"}

    def ensure(nid):
        if nid not in narr:
            narr[nid] = {"id": nid, "name": "راوٍ لم يُعرَّف في المصدر", "cls": "unknown"}

    # ---------- hadiths ----------
    hadiths = {}
    kitabs = {"bukhari": [], "muslim": []}
    kitab_no = {"bukhari": {}, "muslim": {}}
    for h in C["hadiths"]:
        book = h["book"]
        title = h.get("kitab") or "—"
        if title not in kitab_no[book]:
            no = h.get("kitab_no") if book == "muslim" and h.get("kitab_no") else len(kitab_no[book]) + 1
            kitab_no[book][title] = no
            kitabs[book].append({"no": no, "title": title, "count": 0})
        kno = kitab_no[book][title]
        next(k for k in kitabs[book] if k["no"] == kno)["count"] += 1
        key = f"{PREFIX[book]}{h['src_no']}"
        chains = []
        for c in h["chains"]:
            ids = [str(x) for x in c["ids"] if str(x) not in author_ids]
            for x in ids:
                ensure(x)
            chains.append({"ids": ids, "grade": c["grade"], "hukm": c["hukm"], "c": chain_class(c["grade"], c["hukm"], ids)})
        hadiths[key] = {
            "k": key, "book": book, "num": h.get("std_no") or h["src_no"], "src_no": h["src_no"],
            "std": bool(h.get("std_no")), "kitab": kno, "bab": h.get("bab", ""), "type": h["type"],
            "hukm": h["hukm"], "text": h["text"], "matn": h.get("matn"),
            "mentions": [[s, e, str(r)] for s, e, r in h["mentions"]],
            "chains": chains, "kg_group": h.get("group"),
        }
    for book in kitabs:
        kitabs[book].sort(key=lambda k: k["no"])

    # ---------- groups: same meaning across the two books ----------
    members = defaultdict(list)
    for k, h in hadiths.items():
        members[h["kg_group"] if h["kg_group"] else f"solo:{k}"].append(k)
    group_keys = sorted(members, key=lambda g: (-len(members[g]), str(g)))
    gindex = {g: i for i, g in enumerate(group_keys)}
    for g, ks in members.items():
        for k in ks:
            hadiths[k]["g"] = gindex[g]
    all_books = {int(k): v for k, v in C["groups"].items()}

    # ---------- narrator statistics ----------
    in_book = defaultdict(lambda: {"bukhari": set(), "muslim": set()})
    teachers, students = defaultdict(Counter), defaultdict(Counter)
    shaykh_of = {"bukhari": Counter(), "muslim": Counter()}
    sanad_freq = Counter()
    chain_len = {"bukhari": Counter(), "muslim": Counter()}
    chain_cls = {"bukhari": Counter(), "muslim": Counter()}
    thulathiyyat, shortest_muslim = [], []
    for k, h in hadiths.items():
        book = h["book"]
        for c in h["chains"]:
            ids = c["ids"]
            chain_cls[book][c["c"]] += 1
            for x in ids:
                if x not in SPECIAL:
                    in_book[x][book].add(k)
            full = [PROPHET] + ids + [COMPILER[book]]
            for a, b in zip(full, full[1:]):
                teachers[b][a] += 1
                students[a][b] += 1
            if not ids:
                continue
            if ids[-1] not in SPECIAL:
                shaykh_of[book][ids[-1]] += 1
            if c["c"] != "muallaq":
                chain_len[book][len(ids)] += 1
            top_is_companion = narr[ids[0]]["cls"] == "sahabi"
            # al-Bukhari's own shaykh must be of tabaqa 9+; an earlier one means a truncated chain
            shaykh_ok = (narr[ids[-1]].get("tabaka") or 0) >= 9
            if book == "bukhari" and len(ids) == 3 and top_is_companion and shaykh_ok and c["c"] != "muallaq":
                thulathiyyat.append({"k": k, "chain": ids})
            if book == "muslim" and len(ids) == 4 and top_is_companion and c["c"] != "muallaq":
                shortest_muslim.append({"k": k, "chain": ids})
            if len(ids) >= 3 and not SPECIAL.keys() & set(ids[:3]):
                sanad_freq[tuple(ids[:3])] += 1

    # ---------- write group shards ----------
    groups = []
    shards = defaultdict(dict)
    for g in group_keys:
        gi = gindex[g]
        ks = sorted(members[g], key=lambda k: (k[0], hadiths[k]["src_no"]))
        hs = {k: hadiths[k] for k in ks}
        chains = [(k, c["ids"]) for k in ks for c in hs[k]["chains"] if c["ids"]]
        companions = Counter(c[0] for _, c in chains)
        branch = defaultdict(set)
        depth = {}
        for k, c in chains:
            full = c + [COMPILER[hadiths[k]["book"]]]
            for i, (a, b) in enumerate(zip(full, full[1:])):
                branch[a].add(b)
                depth[a] = min(depth.get(a, 99), i)
        madar = None
        if branch:
            cand, kids = max(branch.items(), key=lambda kv: (len(kv[1]), -depth[kv[0]]))
            if len(kids) >= 2 and cand not in (BUKHARI, MUSLIM) and cand not in SPECIAL:
                madar = cand
        spread = all_books.get(g) if isinstance(g, int) else None
        grp = {
            "g": gi, "hadiths": ks, "n_chains": len(chains), "books": sorted({hadiths[k]["book"] for k in ks}),
            "companions": [[c, n] for c, n in companions.most_common()], "madar": madar,
            "spread": spread and {"n_hadith": spread["n_hadith"], "n_sanad": spread["n_sanad"],
                                  "n_books": len(spread["books"]), "n_companions": spread.get("n_companions"),
                                  "books": spread["books"][:30]},
        }
        groups.append(grp)
        ids = {x for _, c in chains for x in c} | {m[2] for k in ks for m in hadiths[k]["mentions"]}
        items = {k: {f: v for f, v in hadiths[k].items() if f not in ("kg_group",)} for k in ks}
        shards[gi // GROUP_SHARD][gi] = {**grp, "items": items,
                                         "nar": {i: light(narr[i]) for i in ids | {PROPHET, BUKHARI, MUSLIM} if i in narr}}
    for s, content in shards.items():
        dump(content, SITE_DATA / "g" / f"{s}.json")

    # ---------- narrator directory & detail shards ----------
    directory = {}
    nshards = defaultdict(dict)
    for nid, n in narr.items():
        hb, hm = in_book[nid]["bukhari"], in_book[nid]["muslim"]
        if not (hb or hm):
            continue
        directory[nid] = [n["name"], n["cls"], len(hb), len(hm)]
        nshards[shard_of(nid)][nid] = {
            **{k: v for k, v in n.items() if v not in (None, "", [], 0) or k == "cls"},
            "tabaka_label": TABAQA.get(n.get("tabaka")),
            "b": sorted(hb, key=lambda x: int(x[1:])),
            "m": sorted(hm, key=lambda x: int(x[1:])),
            "teachers": teachers[nid].most_common(60),
            "students": students[nid].most_common(60),
            "n_teachers": len(teachers[nid]),
            "n_students": len(students[nid]),
        }
    for s, content in nshards.items():
        dump(content, SITE_DATA / "n" / f"{s}.json")

    # ---------- search index: [key, group, normalised text, bab, display number] ----------
    search = [[h["k"], h["g"], norm(h["text"]), h["bab"], h["num"]] for h in hadiths.values()]
    dump(search, SITE_DATA / "search.json")

    # ---------- dashboard indicators ----------
    def top(counter, n=15):
        return [[k, v] for k, v in counter.most_common(n)]

    real = [x for x in in_book if narr[x]["cls"] not in ("unknown",) or narr[x].get("rank")]
    narr_hadiths = Counter({x: len(in_book[x]["bukhari"] | in_book[x]["muslim"]) for x in in_book})
    companions_count = Counter({x: c for x, c in narr_hadiths.items() if narr[x]["cls"] == "sahabi"})
    by_cls = Counter(narr[x]["cls"] for x in in_book)
    tabaka = Counter(narr[x].get("tabaka") for x in in_book if narr[x].get("tabaka"))
    city = Counter()
    for x in in_book:
        for c in re.split(r"\s*[،,]\s*", narr[x].get("iqama") or ""):
            if c.strip():
                city[c.strip()] += 1
    death_bins = Counter()
    for x in in_book:
        y = narr[x].get("death_year")
        if y and 0 < y < 400:
            death_bins[(y // 25) * 25] += 1
    madar_count = Counter(g["madar"] for g in groups if g["madar"] and len(g["hadiths"]) > 1)
    widest = sorted((g for g in groups if g["spread"]), key=lambda g: -g["spread"]["n_sanad"])[:15]
    most_turuq = sorted(groups, key=lambda g: -g["n_chains"])[:15]
    first_text = lambda g: snippet(hadiths[g["hadiths"][0]]["text"], hadiths[g["hadiths"][0]]["matn"])

    stats = {
        "totals": {
            "hadith_bukhari": sum(1 for h in hadiths.values() if h["book"] == "bukhari"),
            "hadith_muslim": sum(1 for h in hadiths.values() if h["book"] == "muslim"),
            "chains_bukhari": sum(chain_cls["bukhari"].values()),
            "chains_muslim": sum(chain_cls["muslim"].values()),
            "narrators": len(in_book),
            "narrators_bukhari": sum(1 for v in in_book.values() if v["bukhari"]),
            "narrators_muslim": sum(1 for v in in_book.values() if v["muslim"]),
            "narrators_shared": sum(1 for v in in_book.values() if v["bukhari"] and v["muslim"]),
            "companions": sum(1 for x in in_book if narr[x]["cls"] == "sahabi"),
            "groups_shared": sum(1 for g in groups if len(g["books"]) == 2),
            "thulathiyyat": len(thulathiyyat),
            "muallaqat": chain_cls["bukhari"]["muallaq"],
            "mudallisun": sum(1 for x in in_book if narr[x].get("tadlis")),
            "mukhtalitun": sum(1 for x in in_book if narr[x].get("ikhtilat")),
        },
        "top_narrators": top(narr_hadiths, 20),
        "top_companions": top(companions_count, 15),
        "top_shaykhs_bukhari": top(shaykh_of["bukhari"]),
        "top_shaykhs_muslim": top(shaykh_of["muslim"]),
        "top_isnads": [[list(k), v] for k, v in sanad_freq.most_common(15)],
        "top_madar": top(madar_count, 15),
        "most_turuq": [{"first": g["hadiths"][0], "n_chains": g["n_chains"], "n_hadiths": len(g["hadiths"]),
                        "books": g["books"], "snippet": first_text(g)} for g in most_turuq],
        "widest": [{"first": g["hadiths"][0], "n_sanad": g["spread"]["n_sanad"], "n_books": g["spread"]["n_books"],
                    "n_companions": g["spread"]["n_companions"], "snippet": first_text(g)} for g in widest],
        "chain_classes": {b: [[c, v] for c, v in cnt.most_common()] for b, cnt in chain_cls.items()},
        "grades": [[c, by_cls.get(c, 0)] for c in ("sahabi", "thiqa", "saduq", "maqbul", "weak", "unknown")],
        "tabaqat": [[TABAQA[t], tabaka.get(t, 0), t] for t in range(1, 13)],
        "cities": top(city, 12),
        "deaths": sorted(death_bins.items()),
        "chain_length": {b: sorted(v.items()) for b, v in chain_len.items()},
        "thulathiyyat": [{**t, "snippet": snippet(hadiths[t["k"]]["text"], hadiths[t["k"]]["matn"]), "num": hadiths[t["k"]]["num"]}
                         for t in thulathiyyat],
        "shortest_muslim": [{**t, "snippet": snippet(hadiths[t["k"]]["text"], hadiths[t["k"]]["matn"]), "num": hadiths[t["k"]]["num"]}
                            for t in shortest_muslim][:40],
    }
    used = {x for key in ("top_narrators", "top_companions", "top_shaykhs_bukhari", "top_shaykhs_muslim", "top_madar")
            for x, _ in stats[key]}
    used |= {x for i, _ in stats["top_isnads"] for x in i}
    used |= {x for s in stats["thulathiyyat"] + stats["shortest_muslim"] for x in s["chain"]}
    stats["nar"] = {i: light(narr[i]) for i in used}
    dump(stats, SITE_DATA / "stats.json")

    meta = {
        "books": {"bukhari": {"title": "صحيح البخاري", "kitabs": kitabs["bukhari"]},
                  "muslim": {"title": "صحيح مسلم", "kitabs": kitabs["muslim"]}},
        "index": {k: [h["kitab"], h["g"], h["num"]] for k, h in hadiths.items()},
        "directory": directory,
        "group_shard": GROUP_SHARD,
        "narr_shards": NARR_SHARDS,
    }
    dump(meta, SITE_DATA / "meta.json")
    print(f"site data: {len(hadiths)} hadiths, {len(groups)} groups in {len(shards)} shards, "
          f"{len(directory)} narrators in {len(nshards)} shards; thulathiyyat {len(thulathiyyat)}")


def light(n):
    return {k: v for k, v in (("name", n["name"]), ("cls", n.get("cls", "unknown")), ("rank", n.get("rank")),
                              ("tabaka", n.get("tabaka")), ("death", n.get("death")),
                              ("tadlis", n.get("tadlis")), ("ikhtilat", n.get("ikhtilat"))) if v}


def shard_of(nid):
    h = 0
    for ch in nid:
        h = (h * 31 + ord(ch)) % 1_000_003
    return h % NARR_SHARDS


if __name__ == "__main__":
    main()
