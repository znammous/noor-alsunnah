"""Build the static site data from data/work/corpus.json -> site/data/

Layout (sharded to keep the file count low for static hosting):
  meta.json        books + kitabs, hadith index (+ number aliases), narrator directory
  stats.json       dashboard indicators
  search/<book>.json  normalised text for in-browser search, per book (lazy loaded)
  g/<shard>.json   hadith groups (turuq): hadiths + chains + madar + spread in other books
  n/<shard>.json   narrator details: profile, teachers, students, hadiths
"""
import re
from collections import Counter, defaultdict

from common import _DIACRITICS as DIACRITIC, SITE_DATA, WORK, dump, load, norm, strip_diacritics

SHARD_BYTES = 400_000      # target size of a hadith shard (groups are packed until this is reached)
NARR_SHARDS = 64
PROPHET = "nabi"
# book key -> (URL prefix, title, compiler node label); the compiler node id is the book key,
# except for the compilers who are also narrators in the other books (see NARRATOR_COMPILERS)
BOOKS = {
    "bukhari": ("b", "صحيح البخاري", "الإمام البخاري"),
    "muslim": ("m", "صحيح مسلم", "الإمام مسلم"),
    "abudawud": ("d", "سنن أبي داود", "الإمام أبو داود"),
    "tirmidhi": ("t", "جامع الترمذي", "الإمام الترمذي"),
    "nasai": ("n", "سنن النسائي", "الإمام النسائي"),
    "ibnmajah": ("j", "سنن ابن ماجه", "الإمام ابن ماجه"),
    "ahmad": ("a", "مسند أحمد", "الإمام أحمد"),
    "muwatta": ("w", "موطأ مالك", "الإمام مالك"),
    "darimi": ("r", "مسند الدارمي", "الإمام الدارمي"),
}
SITTA = ["bukhari", "muslim", "abudawud", "tirmidhi", "nasai", "ibnmajah"]
# Malik, Ahmad and al-Darimi also narrate in the chains of the other books (Ahmad is a shaykh of
# Abu Dawud, al-Darimi of Muslim): their own node is their narrator entry, so the Muwatta's chains
# meet al-Bukhari's at Malik, and his teachers include those he narrates from in the Muwatta.
NARRATOR_COMPILERS = {"ahmad", "muwatta", "darimi"}
# Abdullah son of Ahmad transmits the Musnad; his own additions (zawa'id) end with him, not his father
ZAWAID_NARRATOR = "3562"
BOOK_ORDER = {b: i for i, b in enumerate(BOOKS)}
ORDINALS = [("الثانية عشرة", 12), ("الحادية عشرة", 11), ("العاشرة", 10), ("التاسعة", 9), ("الثامنة", 8),
            ("السابعة", 7), ("السادسة", 6), ("الخامسة", 5), ("الرابعة", 4), ("الثالثة", 3), ("الثانية", 2),
            ("الأولى", 1)]
TABAQA = {1: "الصحابة", 2: "كبار التابعين", 3: "الوسطى من التابعين", 4: "تلي الوسطى من التابعين",
          5: "صغار التابعين", 6: "عاصروا صغار التابعين", 7: "كبار أتباع التابعين", 8: "الوسطى من أتباع التابعين",
          9: "صغار أتباع التابعين", 10: "كبار الآخذين عن تبع الأتباع", 11: "الوسطى من الآخذين عن تبع الأتباع",
          12: "صغار الآخذين عن تبع الأتباع"}
CHAIN_ORDER = ["thiqa", "saduq", "maqbul", "weak"]


COMPANION = re.compile(r"(?<!أ)صحابي|(?<!أ)صحابية|الصحابة|صحبة|وصحب(?:\s|$)|أحد العشرة|السابقين|الخلفاء الأربعة|"
                       r"المبشرة|عم رسول الله|أول مولود في الإسلام|بدري|شهد (?:بدرا|أحدا|الحديبية|بيعة)|أسلم (?:عام|يوم|قبل)|"
                       r"لها? رؤية|رأى النبي|خليفة رسول الله|زوج (?:النبي|رسول الله)|ربيبة النبي|أم المؤمنين")


FEMALE_FIRST = {"أم", "ابنة", "امرأة", "بنت", "جدة", "عمة", "خالة", "أخت", "مولاة", "زوجة"}


def is_female(n):
    """Women narrators, guessed from the name (أم فلان، فلانة بنت فلان، الفلانية) and the biography."""
    w = strip_diacritics(n.get("name") or "").split()
    if not w or w[0] in ("ابن", "أبو", "أبي"):
        return False
    bio = f"{n.get('rank') or ''} {n.get('tabaka_text') or ''}"
    return (w[0] in FEMALE_FIRST or (len(w) > 1 and w[1] in ("بنت", "مولاة"))
            or (len(w) == 2 and w[0].endswith(("ة", "ى", "اء")) and w[1].startswith("ال") and w[1].endswith("ية"))
            or bool(re.search(r"صحابية|زوج النبي|أم المؤمنين", bio)))


def tabaqa_of(cls_text):
    t = strip_diacritics(cls_text or "")
    if not t:
        return None
    if COMPANION.search(t) and "مخضرم" not in t:
        return 1
    for word, n in ORDINALS:
        if word in t:
            return n
    return None


GRADE_PATTERNS = [
    ("weak", r"ليس بثقة|كذاب|وضاع|متهم|متروك|منكر الحديث|ضعيف|لين الحديث|ليس بالقوي|واه|مجهول(?! الحال)"),
    ("maqbul", r"مقبول|مستور|مجهول الحال"),
    ("thiqa", r"ثقة|ثقه|الثقات|ثبت|الأثبات|حافظ|حجة|إمام|متقن|المتقنين|المتثبتين|أمير المؤمنين|مجمع على ثقته"),
    ("saduq", r"صدوق|لا بأس به|ليس به بأس|محله الصدق"),
]


def grade_of(rank, tabaka, name=""):
    """Colour class from Ibn Hajar's verdict: its first clause decides, else the whole verdict."""
    if tabaka == 1 or COMPANION.search(strip_diacritics(name or "")) or "أحد الصحابة" in (name or ""):
        return "sahabi"
    t = strip_diacritics(rank or "").strip()
    if not t:
        return "unknown"
    head = re.split(r"[،,؛]|\sإلا\s|\sلكن\s", t)[0]
    if COMPANION.search(head) and "مخضرم" not in head:
        return "sahabi"
    for scope in (head, t):
        for cls, pat in GRADE_PATTERNS:
            if re.search(pat, scope):
                return cls
    return "unknown"


# Ahmad began hearing hadith around 179 AH: a shaykh who died before that (Ibn Jurayj, al-Thawri ...)
# means the source dropped a narrator, so the chain is not really a thulathi
AHMAD_FIRST_HEARING = 179


def last_year(date):
    years = [int(y) for y in re.findall(r"\d{2,3}", strip_diacritics(date or ""))]
    return max(years) if years else None


def first_year(date):
    m = re.search(r"\d{1,3}", strip_diacritics(date or ""))
    return int(m.group()) if m else None


def chain_class(ids, narr):
    """Describe a chain by the weakest Ibn Hajar grade among its non-companion narrators."""
    worst, unknown = -1, False
    for i in ids:
        cls = narr.get(i, {}).get("cls", "unknown")
        if cls in ("sahabi", "nabi"):
            continue
        if cls in CHAIN_ORDER:
            worst = max(worst, CHAIN_ORDER.index(cls))
        else:
            unknown = True
    if worst >= 2:
        return "mutakallam"
    if worst == 1:
        return "saduq"
    return "unknown" if unknown else "thiqat"


def snippet(h, n=150):
    p = h["parts"][0]
    t = p["text"][p["matn"][0]:p["matn"][1]] if p.get("matn") else p["text"]
    t = strip_diacritics(t).strip()
    return t[:n].strip() + ("…" if len(t) > n else "")


def num_label(h):
    nums = [h["num"]] + h.get("aliases", [])
    return nums[0] if len(nums) == 1 else f"{nums[0]}–{nums[-1]}"


def main():
    C = load(WORK / "corpus.json")
    compiler_ids = {str(v) for b, v in C["compilers"].items() if b not in NARRATOR_COMPILERS}
    COMPILER = {b: str(C["compilers"][b]) if b in NARRATOR_COMPILERS else b for b in BOOKS}
    FIXED_NODES = {PROPHET, *COMPILER.values()}

    # ---------- narrators ----------
    narr = {}
    for k, v in C["narrators"].items():
        if k in compiler_ids:
            continue
        tab = tabaqa_of(v.get("class_of_narrators"))
        rank = (v.get("rank_by_ibn_hajar") or "").strip()
        narr[k] = {
            "id": k, "name": v["display_name"].strip(), "full": (v.get("name") or "").strip(),
            "kunya": v.get("kunya"), "laqab": v.get("nickname"), "nasab": v.get("lineage"),
            "relation": v.get("relation"), "madhhab": v.get("school_of_thought"),
            "rank": rank, "rank_dhahabi": (v.get("rank_by_al_dhahabi") or "").strip(),
            "tabaka": tab, "tabaka_text": v.get("class_of_narrators"),
            "cls": grade_of(rank, tab, v["display_name"]),
            "birth": v.get("date_of_birth"), "death": v.get("date_of_death"), "death_year": first_year(v.get("date_of_death")),
            "iqama": v.get("country_of_residence"), "rihla": v.get("country_of_travel"),
            "birth_place": v.get("country_of_birth"), "death_place": v.get("country_of_death"),
            "tadlis": 1 if re.search(r"دلس|تدليس|مدلس", rank) else 0,
            "ikhtilat": 1 if re.search(r"اختلط|تغير", rank) else 0,
        }
    narr[PROPHET] = {"id": PROPHET, "name": "النبي ﷺ", "cls": "nabi"}
    for b, (_, _, label) in BOOKS.items():
        if b not in NARRATOR_COMPILERS:
            narr[b] = {"id": b, "name": label, "cls": "imam"}

    def ensure(nid):
        if nid not in narr:
            label = nid[2:] if nid.startswith("u:") else nid
            narr[nid] = {"id": nid, "name": label, "cls": "unknown", "unlinked": 1}

    # ---------- hadiths ----------
    hadiths, kitabs = {}, {b: {} for b in BOOKS}
    for h in C["hadiths"]:
        book = h["book"]
        kitabs[book].setdefault(h["kitab_no"], {"no": h["kitab_no"], "title": h["kitab"], "count": 0})["count"] += 1
        chains = []
        for c in h["chains"]:
            ids = [str(x) for x in c if str(x) not in compiler_ids]
            for x in ids:
                ensure(x)
            if ids:
                chains.append({"ids": ids, **({"z": 1} if book == "ahmad" and ids[-1] == ZAWAID_NARRATOR else {})})
        hadiths[h["key"]] = {
            "k": h["key"], "book": book, "num": h["num"], "label": num_label(h), "aliases": h.get("aliases", []),
            "kitab": h["kitab_no"], "bab": h["bab"], "type": h["type"],
            "parts": [{"text": p["text"], "matn": p["matn"], **({"notes": p["notes"]} if p.get("notes") else {}),
                       "mentions": [[s, e, str(i)] for s, e, i in p["mentions"]]} for p in h["parts"]],
            "chains": chains, "group_root": h["group"], "verdicts": h.get("verdicts", []),
            "rel": h["rel"], "spread": {**h["spread"], "n_books": len(h["spread"]["books"]),
                                         "books": h["spread"]["books"][:30], "shawahid": h["spread"]["shawahid"][:30]},
        }
    for h in hadiths.values():
        for c in h["chains"]:
            c["c"] = chain_class(c["ids"], narr)

    # ---------- groups ----------
    members = defaultdict(list)
    for k, h in hadiths.items():
        members[h["group_root"]].append(k)
    group_keys = sorted(members, key=lambda g: (-len(members[g]), g))
    gindex = {g: i for i, g in enumerate(group_keys)}
    for g, ks in members.items():
        for k in ks:
            hadiths[k]["g"] = gindex[g]

    # ---------- narrator statistics ----------
    in_book = defaultdict(lambda: {b: set() for b in BOOKS})
    teachers, students = defaultdict(Counter), defaultdict(Counter)
    link_keys = defaultdict(set)  # (teacher, student) -> hadiths whose chains carry that link
    shaykh_of = {b: Counter() for b in BOOKS}
    sanad_freq = Counter()
    chain_len = {b: Counter() for b in BOOKS}
    chain_cls = {b: Counter() for b in BOOKS}
    # chains with only three narrators between the compiler and the Prophet ﷺ (not Abdullah's zawa'id)
    thulathiyyat, thulathiyyat_ahmad, shortest_muslim = [], [], []

    def heard_by_ahmad(shaykh):
        y = last_year(narr[shaykh].get("death"))
        return y >= AHMAD_FIRST_HEARING if y else (narr[shaykh].get("tabaka") or 0) >= 7
    for k, h in hadiths.items():
        book = h["book"]
        for c in h["chains"]:
            ids = c["ids"]
            chain_cls[book][c["c"]] += 1
            chain_len[book][len(ids)] += 1
            full = [PROPHET] + ids + ([] if c.get("z") else [COMPILER[book]])
            for x in full[1:]:
                if x in narr and x not in BOOKS:
                    in_book[x][book].add(k)
            for a, b in zip(full, full[1:]):
                teachers[b][a] += 1
                students[a][b] += 1
                link_keys[a, b].add(k)
            if not c.get("z"):
                shaykh_of[book][ids[-1]] += 1
            top_companion = narr[ids[0]]["cls"] == "sahabi"
            # a tabi'i must follow the companion, otherwise the chain is truncated in the source
            linked = 2 <= (narr[ids[1]].get("tabaka") or 0) <= 6 if len(ids) > 1 else False
            # Ibn Hajar's sixth tabaqa met no companion; and a thulathi is a hadith of the Prophet ﷺ
            tabii = 2 <= (narr[ids[1]].get("tabaka") or 0) <= 5 if len(ids) > 1 else False
            marfu = h["type"] in ("مرفوع", "قدسي")
            if book == "bukhari" and len(ids) == 3 and top_companion and linked:
                thulathiyyat.append({"k": k, "chain": ids})
                c["t"] = 1
            if (book == "ahmad" and not c.get("z") and len(ids) == 3 and top_companion and tabii and marfu
                    and heard_by_ahmad(ids[2])):
                thulathiyyat_ahmad.append({"k": k, "chain": ids})
                c["t"] = 1
            if book == "muslim" and len(ids) == 4 and top_companion and linked:
                shortest_muslim.append({"k": k, "chain": ids})
            if len(ids) >= 3:
                sanad_freq[tuple(ids[:3])] += 1

    # ---------- each hadith with exactly the parallels the program lists for it ----------
    def summarize(keys):
        chains = [(k, c) for k in keys for c in hadiths[k]["chains"]]
        companions = Counter(c["ids"][0] for _, c in chains if narr[c["ids"][0]]["cls"] == "sahabi")
        branch, depth = defaultdict(set), {}
        for k, c in chains:
            full = c["ids"] + ([] if c.get("z") else [COMPILER[hadiths[k]["book"]]])
            for i, (a, b) in enumerate(zip(full, full[1:])):
                branch[a].add(b)
                depth[a] = min(depth.get(a, 99), i)
        madar = None
        if branch:
            cand, kids = max(branch.items(), key=lambda kv: (len(kv[1]), -depth[kv[0]]))
            if len(kids) >= 2:
                madar = cand
        return {"n_chains": len(chains), "madar": madar, "books": sorted({hadiths[k]["book"] for k in keys}),
                "companions": [[c, n] for c, n in companions.most_common()]}

    for k, h in hadiths.items():
        h["set"] = summarize([k] + h["rel"])

    # connected components are only a storage unit: a hadith and all it links to share a shard.
    # Groups are packed into shards by size, so no shard grows much beyond SHARD_BYTES.
    shards, gshard, current, used_bytes = defaultdict(dict), [0] * len(group_keys), 0, 0
    for g in group_keys:
        gi = gindex[g]
        size = sum(len(p["text"]) * 2 + 200 * len(hadiths[k]["chains"]) for k in members[g] for p in hadiths[k]["parts"])
        if used_bytes and used_bytes + size > SHARD_BYTES:
            current, used_bytes = current + 1, 0
        used_bytes += size
        gshard[gi] = current
        ks = sorted(members[g], key=lambda k: (BOOK_ORDER[hadiths[k]["book"]], int(hadiths[k]["num"])))
        ids = {x for k in ks for c in hadiths[k]["chains"] for x in c["ids"]}
        ids |= {m[2] for k in ks for p in hadiths[k]["parts"] for m in p["mentions"]}
        items = {k: {f: v for f, v in hadiths[k].items() if f != "group_root"} for k in ks}
        shards[gshard[gi]][gi] = {"g": gi, "items": items,
                                         "nar": {i: light(narr[i]) for i in ids | FIXED_NODES if i in narr}}
    for s_, content in shards.items():
        dump(content, SITE_DATA / "g" / f"{s_}.json")

    # ---------- narrator directory & detail shards ----------
    directory, nshards = {}, defaultdict(dict)
    own_book = {COMPILER[b]: b for b in NARRATOR_COMPILERS}
    key_num = lambda x: (int(hadiths[x]["num"]), x)

    # repeats (المكرر): a narrator's hadiths joined by the source's rel links, counted once. Only links
    # inside his own set are followed, so the transitive over-merging of the global groups stays out.
    def repeat_sets(keys):
        keys = set(keys)
        parent = {k: k for k in keys}

        def find(x):
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x
        for k in keys:
            for r in hadiths[k]["rel"]:
                if r in keys:
                    parent[find(k)] = find(r)
        return {k: find(k) for k in keys}

    for nid, n in narr.items():
        per_book = in_book[nid]
        if not any(per_book.values()) or n.get("unlinked"):
            continue
        # a compiler's own book is his page's business, not a measure of how much he narrates
        counted = [b for b in BOOKS if own_book.get(nid) != b]
        uniq, dup = [], []
        for b in BOOKS:
            root = repeat_sets(per_book[b])
            seen = set()
            for k in sorted(per_book[b], key=key_num):  # the first place stays, later ones are repeats
                if root[k] in seen:
                    dup.append(k)
                seen.add(root[k])
            uniq.append(len(seen) if b in counted else 0)
        across = len(set(repeat_sets(set().union(*(per_book[b] for b in counted))).values()))
        directory[nid] = [n["name"], n["cls"], [len(per_book[b]) if b in counted else 0 for b in BOOKS], uniq, across]
        nshards[shard_of(nid)][nid] = {
            **{k: v for k, v in n.items() if v not in (None, "", [], 0) or k == "cls"},
            "tabaka_label": TABAQA.get(n.get("tabaka")),
            "hadiths": {b: sorted(per_book[b], key=key_num) for b in BOOKS if per_book[b]},
            "dup": sorted(dup), "uniq": across,
            "teachers": [[x, c, sorted(link_keys[x, nid], key=key_num)] for x, c in teachers[nid].most_common(60)],
            "students": [[x, c, sorted(link_keys[nid, x], key=key_num)] for x, c in students[nid].most_common(60)],
            "n_teachers": len(teachers[nid]), "n_students": len(students[nid]),
        }
    for s, content in nshards.items():
        dump(content, SITE_DATA / "n" / f"{s}.json")

    # ---------- search index per book: [key, group, text, bab, number label, matn ranges] ----------
    # text keeps the original spelling without diacritics (the browser folds it for matching, char for char),
    # and matn ranges are flat [start, end, ...] offsets into it so results can tell isnad from matn.
    def search_text(h):
        out, ranges, pos = [], [], 0
        for p in h["parts"]:
            t = re.sub(r"\s", " ", p["text"])  # 1:1, so the matn offsets still apply
            kept = [i for i, ch in enumerate(t) if not DIACRITIC.match(ch)]
            at = {i: j for j, i in enumerate(kept)}
            plain = "".join(t[i] for i in kept)
            if p["matn"]:
                s0, e0 = p["matn"]
                s1 = next((at[i] for i in range(s0, len(t)) if i in at), len(plain))
                e1 = next((at[i] + 1 for i in range(min(e0, len(t)) - 1, -1, -1) if i in at), 0)
                if e1 > s1:
                    ranges += [pos + s1, pos + e1]
            out.append(plain)
            pos += len(plain) + 1
        return " ".join(out), ranges

    for b in BOOKS:
        search = []
        for h in hadiths.values():
            if h["book"] == b:
                text, ranges = search_text(h)
                search.append([h["k"], h["g"], text, h["bab"], h["label"], ranges])
        dump(search, SITE_DATA / "search" / f"{b}.json")

    # ---------- dashboard indicators ----------
    def top(counter, n=15):
        return [[k, v] for k, v in counter.most_common(n)]

    real = [x for x in in_book if not narr[x].get("unlinked")]
    narr_hadiths = Counter({x: len(set().union(*(v for b, v in in_book[x].items() if own_book.get(x) != b))) for x in real})
    companions_count = Counter({x: c for x, c in narr_hadiths.items() if narr[x]["cls"] == "sahabi"})
    by_cls = Counter(narr[x]["cls"] for x in real)
    tabaka = Counter(narr[x].get("tabaka") for x in real if narr[x].get("tabaka"))
    city = Counter()
    for x in real:
        for c in re.split(r"\s*[،,]\s*", narr[x].get("iqama") or ""):
            if c.strip():
                city[c.strip()] += 1
    death_bins = Counter()
    for x in real:
        y = narr[x].get("death_year")
        if y and 0 < y < 400:
            death_bins[(y // 25) * 25] += 1
    # one entry per distinct set of parallels (a hadith and its listed parallels often list each other)
    sets = {}
    for k, h in hadiths.items():
        sets.setdefault(frozenset([k] + h["rel"]), k)
    reps = [hadiths[k] for k in sets.values()]
    madar_count = Counter(h["set"]["madar"] for h in reps if h["set"]["madar"] and h["rel"])
    widest = sorted(reps, key=lambda h: -h["spread"]["n_hadith"])[:15]
    most_turuq = sorted(reps, key=lambda h: -h["set"]["n_chains"])[:15]
    muttafaq = sum(1 for h in hadiths.values() if h["book"] == "muslim" and any(hadiths[r]["book"] == "bukhari" for r in h["rel"]))
    # hadiths of al-Bukhari that the program also traces in all five other books (and in all eight)
    sitta = sum(1 for h in reps if h["book"] == "bukhari" and set(SITTA) <= set(h["set"]["books"]))
    tisa = sum(1 for h in reps if h["book"] == "bukhari" and len(h["set"]["books"]) == len(BOOKS))

    stats = {
        "totals": {
            "books": {b: {"hadith": sum(1 for h in hadiths.values() if h["book"] == b),
                          "chains": sum(chain_cls[b].values()),
                          "narrators": sum(1 for x in real if in_book[x][b])} for b in BOOKS},
            "hadith": len(hadiths),
            "chains": sum(sum(c.values()) for c in chain_cls.values()),
            "narrators": len(real),
            "narrators_shaykhayn": sum(1 for x in real if in_book[x]["bukhari"] and in_book[x]["muslim"]),
            "sitta": sitta, "tisa": tisa,
            "companions": sum(1 for x in real if narr[x]["cls"] == "sahabi"),
            "muttafaq": muttafaq,
            "thulathiyyat": len(thulathiyyat),
            "thulathiyyat_ahmad": len({t["k"] for t in thulathiyyat_ahmad}),
            "mudallisun": sum(1 for x in real if narr[x].get("tadlis")),
            "mukhtalitun": sum(1 for x in real if narr[x].get("ikhtilat")),
        },
        "top_narrators": top(narr_hadiths, 20),
        "top_companions": top(companions_count, 15),
        "top_shaykhs": {b: top(shaykh_of[b], 10) for b in BOOKS},
        "top_isnads": [[list(k), v] for k, v in sanad_freq.most_common(15)],
        "top_madar": top(madar_count, 15),
        "most_turuq": [{"first": h["k"], "n_chains": h["set"]["n_chains"], "n_hadiths": 1 + len(h["rel"]),
                        "books": h["set"]["books"], "snippet": snippet(h)} for h in most_turuq],
        "widest": [{"first": h["k"], "n_hadith": h["spread"]["n_hadith"], "n_books": h["spread"]["n_books"],
                    "n_shawahid": len(h["spread"]["shawahid"]), "snippet": snippet(h)} for h in widest],
        "chain_classes": {b: [[c, v] for c, v in cnt.most_common()] for b, cnt in chain_cls.items()},
        "grades": [[c, by_cls.get(c, 0)] for c in ("sahabi", "thiqa", "saduq", "maqbul", "weak", "unknown")],
        "tabaqat": [[TABAQA[t], tabaka.get(t, 0), t] for t in range(1, 13)],
        "cities": top(city, 12),
        "deaths": sorted(death_bins.items()),
        "chain_length": {b: sorted(v.items()) for b, v in chain_len.items()},
        "thulathiyyat": [{**t, "snippet": snippet(hadiths[t["k"]]), "num": hadiths[t["k"]]["label"]} for t in thulathiyyat],
        "thulathiyyat_ahmad": [{**t, "snippet": snippet(hadiths[t["k"]]), "num": hadiths[t["k"]]["label"]}
                               for t in thulathiyyat_ahmad],
        "shortest_muslim": [{**t, "snippet": snippet(hadiths[t["k"]]), "num": hadiths[t["k"]]["label"]}
                            for t in shortest_muslim][:40],
    }
    used = {x for key in ("top_narrators", "top_companions", "top_madar") for x, _ in stats[key]}
    used |= {x for rows in stats["top_shaykhs"].values() for x, _ in rows}
    used |= {x for i, _ in stats["top_isnads"] for x in i}
    used |= {x for s in stats["thulathiyyat"] + stats["thulathiyyat_ahmad"] + stats["shortest_muslim"]
             for x in s["chain"]}
    stats["nar"] = {i: light(narr[i]) for i in used}
    dump(stats, SITE_DATA / "stats.json")

    # ---------- statistics explorer: per-book repeats, and narrator fields to filter the directory by ----------
    # a book's hadiths joined by the source's rel links inside that book, counted once (approximate)
    def book_uniq(b, keep=lambda h: True):
        keys = [k for k, h in hadiths.items() if h["book"] == b and keep(h)]
        return len(set(repeat_sets(keys).values()))
    marfu = lambda h: h["type"] in ("مرفوع", "قدسي")
    explore = {
        "books": {b: {"hadith": stats["totals"]["books"][b]["hadith"], "uniq": book_uniq(b),
                      "marfu": sum(1 for h in hadiths.values() if h["book"] == b and marfu(h)),
                      "marfu_uniq": book_uniq(b, marfu)} for b in BOOKS},
        # id -> [tabaqa, death year, cities, tadlis | ikhtilat << 1 | woman << 2, chains each compiler heard from him, madar]
        "nar": {nid: [narr[nid].get("tabaka") or 0, narr[nid].get("death_year") or 0,
                      [c.strip() for c in re.split(r"\s*[،,]\s*", narr[nid].get("iqama") or "") if c.strip()],
                      (narr[nid].get("tadlis") or 0) | (narr[nid].get("ikhtilat") or 0) << 1 | is_female(narr[nid]) << 2,
                      [shaykh_of[b][nid] for b in BOOKS], madar_count.get(nid, 0)] for nid in directory},
    }
    dump(explore, SITE_DATA / "explore.json")

    index = {k: [h["kitab"], h["g"], h["label"]] for k, h in hadiths.items()}
    alias = {f"{BOOKS[h['book']][0]}{a}": k for k, h in hadiths.items() for a in h["aliases"]
             if f"{BOOKS[h['book']][0]}{a}" not in hadiths}
    meta = {
        "books": {b: {"title": t, "prefix": pre, "compiler": c, "node": COMPILER[b],
                      "kitabs": sorted(kitabs[b].values(), key=lambda r: r["no"])}
                  for b, (pre, t, c) in BOOKS.items()},
        "index": index, "alias": alias, "directory": directory,
        "gshard": gshard, "narr_shards": NARR_SHARDS,
    }
    dump(meta, SITE_DATA / "meta.json")
    print(f"site data: {len(hadiths)} hadiths in {len(shards)} shards, muttafaq {muttafaq}, sitta {sitta}, "
          f"{len(directory)} narrators in {len(nshards)} shards; thulathiyyat {len(thulathiyyat)}, of Ahmad {len(thulathiyyat_ahmad)}; "
          f"grades {dict(by_cls)}")


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
