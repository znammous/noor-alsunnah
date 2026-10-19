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
from pathlib import Path

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
# the search filter «الصحيح وما في حكمه» sorts each quoted verdict as accepting (صحيح، حسن، لغيره) or
# weakening, and on the hadith itself or only on its isnad ("حديث صحيح، وهذا إسناد ضعيف" is accepted)
ACCEPT = r"صحيح|صحح|على شرط|صحيحان|حسن|حسنان|قوي|جيد|ثابت|متواتر|متفق عليه"
WEAK = r"ضعيف|ضعيفان|منكر|شاذ|موضوع|باطل|منقطع|معضل|مرسل|لا أصل له|مضطرب|معلول|واه|ساقط|مدرج|تالف|مسلسل بالضعفاء|متهم|كذاب|جهالة"


def verdict_class(v):
    """-> (level h=hadith | i=isnad, class s=accepted | w=weak), or None when it states no verdict"""
    t = re.sub(r"\s+", " ", strip_diacritics(v)).replace("ـ", "").strip()
    t = re.sub(r"^في الزوائد:?\s*", "", t)
    m = re.search(rf"(?:^|[\s،,.]|و)(?:ال)?حديث (?:بهذا اللفظ )?({ACCEPT}|{WEAK})|^({ACCEPT}|{WEAK}) ?لغيره", t)
    if m:
        return "h", "s" if re.fullmatch(ACCEPT, m.group(1) or m.group(2)) else "w"
    m = re.search(rf"({ACCEPT})|({WEAK})", t)
    if not m:
        return None
    return "i" if re.search(r"إسناد|رجال|سند", t[:m.end() + 12]) else "h", "s" if m.group(1) else "w"


def hadith_class(book, rows):
    """s (accepted) | w (weak) | m (the sources differ) | "" (no verdict); the Sahihayn are accepted"""
    if book in ("bukhari", "muslim"):
        return "s"
    # al-Busiri's notes quote others at length; al-Albani grades every hadith of Ibn Majah
    cls = [c for src, v, *_ in rows if src != "busiri" or len(rows) == 1 if (c := verdict_class(v))]
    h = {c for lv, c in cls if lv == "h"}
    i = {c for lv, c in cls if lv == "i"}
    if h == {"s"}:
        return "s"
    if h == {"w"}:
        return "m" if "s" in i else "w"
    if h:
        return "m"
    return "s" if i == {"s"} else "w" if i == {"w"} else "m" if i else ""


GRADES = Path(__file__).resolve().parent / "grades"
# the simplified explanations (make_sharh.py): hadith key -> encyclopedia ids, and the languages
SHARH = Path(__file__).resolve().parent / "sharh"
# Ibn Hajar on al-Bukhari's narrators below صدوق, quoted from «هدي الساري» (make_rijal.py)
HADY = Path(__file__).resolve().parent / "rijal" / "hady.json"
# Ibn Hajar's five levels of the mudallisun, «تعريف أهل التقديس» (Shamela 1186), matched by hand to narrator ids
MUDALLISIN = Path(__file__).resolve().parent / "rijal" / "mudallisin.json"
# scholars' verdicts (make_grades.py): "source:book" -> (scholar, work, Shamela book id)
GRADE_SOURCES = {
    "albani:abudawud": ("الألباني", "صحيح وضعيف سنن أبي داود", 1726),
    "albani:tirmidhi": ("الألباني", "صحيح وضعيف سنن الترمذي", 1435),
    "albani:ibnmajah": ("الألباني", "صحيح وضعيف سنن ابن ماجه", 1198),
    "busiri:ibnmajah": ("البوصيري", "مصباح الزجاجة في زوائد ابن ماجه، بنقل محمد فؤاد عبد الباقي", 1198),
    "asad:darimi": ("حسين سليم أسد", "تحقيق مسند الدارمي", 21795),
    "albani-sahih:nasai": ("الألباني", "صحيح سنن النسائي", 1147),
    "albani-daif:nasai": ("الألباني", "ضعيف سنن النسائي", 1148),
    "arnaut:ahmad": ("شعيب الأرناؤوط ومحققو طبعة الرسالة", "مسند أحمد، ط مؤسسة الرسالة", 25794),
    "risala:nasai": ("محققو طبعة الرسالة العالمية", "سنن النسائي، ت محمد رضوان عرقسوسي ومحمد أنس الخن (2018)", 1339),
}


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
    # a name like «مولى ميمونة زوج رسول الله» is a follower's: the name decides only without a tabaqa
    if tabaka == 1 or (not tabaka and COMPANION.search(strip_diacritics(name or ""))) or "أحد الصحابة" in (name or ""):
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


# roughly when each compiler began hearing hadith: a shaykh who died before that (Ibn Jurayj, al-Thawri
# for Ahmad ...) means the source dropped a narrator, so the chain is not really as high as it looks
FIRST_HEARING = {"bukhari": 205, "muslim": 218, "abudawud": 220, "tirmidhi": 225, "nasai": 230,
                 "ibnmajah": 227, "ahmad": 179, "muwatta": 110, "darimi": 200}


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


def chain_culprits(ids, cls, narr):
    """The narrators whose grade gives a chain its class."""
    grade = lambda i: narr.get(i, {}).get("cls", "unknown")
    if cls == "mutakallam":
        return [i for i in ids if grade(i) in ("maqbul", "weak")]
    if cls == "saduq":
        return [i for i in ids if grade(i) == "saduq"]
    if cls == "unknown":
        return [i for i in ids if grade(i) not in CHAIN_ORDER + ["sahabi", "nabi"]]
    return []


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
    grades = {f.stem: load(f) for f in sorted(GRADES.glob("*.json"))}
    sharh = load(SHARH / "links.json") if (SHARH / "links.json").exists() else {}
    similar = load(SHARH / "similar.json") if (SHARH / "similar.json").exists() else {}
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
            **({"grades": g} if (g := [[src, v, page] + ([n] if h.get("aliases") else [])  # number when it spans several
                                      for n in [h["num"], *h.get("aliases", [])]
                                      for src, v, page in grades.get(book, {}).get(str(n), [])]) else {}),
            **({"sx": sharh[h["key"]]} if h["key"] in sharh else {}),
            **({"sy": similar[h["key"]][0]} if h["key"] in similar else {}),
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
    # each book's chains by class: [hadith key, the narrators that set the class]
    chain_rows = {b: defaultdict(list) for b in BOOKS}
    # the highest chains of each book: two to four narrators between the compiler and the Prophet ﷺ
    # (not Abdullah's zawa'id): {book: {length: {hadith key: [chain ids, ...]}}}
    awali = {b: defaultdict(dict) for b in BOOKS}

    def heard_by(book, shaykh):
        y = last_year(narr[shaykh].get("death"))
        if y:
            return y >= FIRST_HEARING[book]
        return (narr[shaykh].get("tabaka") or 0) >= (3 if book == "muwatta" else 7)

    # the later the follower's tabaqa, the later his companion must have died: al-Zuhri (4th) from Uthman
    # (d. 35) or Yahya b. Sa'id (5th) from Umar and Aisha are mursal in the Muwatta
    LATEST_COMPANION = {3: 40, 4: 70, 5: 80, 6: 85}

    def met_companion(tabii, companion):
        a, b = last_year(narr[companion].get("death")), last_year(narr[tabii].get("death"))
        if not a:
            return True
        return a >= LATEST_COMPANION.get(narr[tabii].get("tabaka"), 0) and not (b and b - a > 100)
    for k, h in hadiths.items():
        book = h["book"]
        for c in h["chains"]:
            ids = c["ids"]
            chain_cls[book][c["c"]] += 1
            chain_rows[book][c["c"]].append([k, *dict.fromkeys(chain_culprits(ids, c["c"], narr))])
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
            # the scholars count a companion's own report too (Salamah on the mosque wall, al-Bukhari 497);
            # a follower with no tabaqa in the program is placed by his death (Abu Dawud 4749)
            if len(ids) > 1 and not narr[ids[1]].get("tabaka"):
                tabii = 0 < (last_year(narr[ids[1]].get("death")) or 999) < 180
            if (2 <= len(ids) <= 4 and not c.get("z") and top_companion
                    and (tabii if len(ids) <= 3 else linked) and met_companion(ids[1], ids[0]) and heard_by(book, ids[-1])):
                awali[book][len(ids)].setdefault(k, []).append(ids)
                if len(ids) <= 3:
                    c["t"] = len(ids)
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

    # Ibn Hajar's «مقبول» is «accepted where followed»: for the narrators graded below صدوق, how each of
    # their hadiths stands in the program's chains. [code, the other narrator, the hadith that shows it]
    # q مقرون: named with another narrator between the same teacher and student in the same isnad
    # t متابعة تامة: someone else narrates it from his teacher; s متابعة قاصرة: it reaches his companion
    # by another route; h شاهد: another companion narrates it; f: no other route in the program
    def follow_up(nid, k):
        h = hadiths[k]
        others = [(r, c) for r in sorted([k] + h["rel"], key=lambda r: (r != k, BOOK_ORDER[hadiths[r]["book"]], key_num(r)))
                  for c in hadiths[r]["chains"] if nid not in c["ids"]]
        full = lambda r, c: [PROPHET] + c["ids"] + ([] if c.get("z") else [COMPILER[hadiths[r]["book"]]])
        best = None
        for c in h["chains"]:
            if nid not in c["ids"]:
                continue
            f = full(k, c)
            i = f.index(nid)
            t, s, top = f[i - 1], f[i + 1] if i + 1 < len(f) else None, c["ids"][0]
            for r, o in others:
                g = full(r, o)
                if r == k and s and any(g[j] == t and g[j + 2] == s for j in range(len(g) - 2)):
                    cand = ("q", g[g.index(t) + 1], r)
                elif t != PROPHET and t in g and g.index(t) + 1 < len(g):
                    cand = ("t", g[g.index(t) + 1], r)
                elif narr[top]["cls"] == "sahabi" and o["ids"][0] == top and top != nid:
                    cand = ("s", "", r)
                elif narr[o["ids"][0]]["cls"] == "sahabi" and o["ids"][0] != top:
                    cand = ("h", o["ids"][0], r)
                else:
                    continue
                if not best or "qtsh".index(cand[0]) < "qtsh".index(best[0]):
                    best = cand
        return list(best) if best else ["f", "", ""]

    hady = load(HADY) if HADY.exists() else {}
    # id -> [level, printed page, Shamela page id]
    mudallis = {e["id"]: [e["level"], e["page"], e["page_id"]] for e in load(MUDALLISIN)["entries"] if e["id"]} if MUDALLISIN.exists() else {}
    for nid, n in narr.items():
        per_book = in_book[nid]
        if not any(per_book.values()) or n.get("unlinked"):
            continue
        if n["cls"] in ("maqbul", "weak"):
            n["follow"] = {k: follow_up(nid, k) for b in BOOKS for k in per_book[b]}
        if nid in hady:
            n["hady"] = hady[nid]
        if nid in mudallis:
            n["tadlis_level"] = mudallis[nid]
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

    # ---------- search index per book: [key, group, text, bab, number label, matn ranges, grade class] ----------
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
                search.append([h["k"], h["g"], text, h["bab"], h["label"], ranges, hadith_class(b, h.get("grades", []))])
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
            "thulathiyyat": len(awali["bukhari"].get(3, ())),
            "thulathiyyat_ahmad": len(awali["ahmad"].get(3, ())),
            "thulathiyyat_all": {b: len(awali[b].get(3, ())) for b in BOOKS},
            "mudallisun": sum(1 for x in real if narr[x].get("tadlis")),
            "mukhtalitun": sum(1 for x in real if narr[x].get("ikhtilat")),
        },
        "top_narrators": top(narr_hadiths, 20),
        "top_companions": top(companions_count, 15),
        "top_shaykhs": {b: top(shaykh_of[b], 10) for b in BOOKS},
        "top_isnads": [[list(k), v] for k, v in sanad_freq.most_common(50)],
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
    }
    used = {x for key in ("top_narrators", "top_companions", "top_madar") for x, _ in stats[key]}
    used |= {x for rows in stats["top_shaykhs"].values() for x, _ in rows}
    used |= {x for i, _ in stats["top_isnads"] for x in i}
    stats["nar"] = {i: light(narr[i]) for i in used}
    dump(stats, SITE_DATA / "stats.json")
    for b, rows in chain_rows.items():
        dump(rows, SITE_DATA / "chains" / f"{b}.json")

    # ---------- the highest chains of each book (al-'awali): thunaiyyat and thulathiyyat, and the
    # ruba'iyyat of the books that have nothing higher (Muslim, al-Nasa'i) ----------
    # {book: {length: [[key, number label, snippet, chains...]]}}, in the book's order
    order = lambda k: int(hadiths[k]["num"])
    awali_out = {b: {n: [[k, hadiths[k]["label"], snippet(hadiths[k], 110), *chains]
                         for k, chains in sorted(by_len[n].items(), key=lambda kv: order(kv[0]))]
                     for n in sorted(by_len) if n <= 3 or not any(m <= 3 for m in by_len)}
                 for b, by_len in awali.items()}
    used = {x for by_len in awali_out.values() for rows in by_len.values() for r in rows for c in r[3:] for x in c}
    dump({"books": awali_out, "nar": {i: light(narr[i]) for i in used}}, SITE_DATA / "awali.json")

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

    # ---------- hadith ranking by turuq: every distinct set of parallels with more than one chain ----------
    # [first key, chains, hadiths, book prefixes, madar, companions, Jami' narrations, Jami' books, snippet]
    turuq = sorted((h for h in reps if h["set"]["n_chains"] > 1), key=lambda h: -h["set"]["n_chains"])
    # each set is shown at its place in the earliest book (al-Bukhari first, then Muslim, ...)
    lead = lambda h: min([h["k"]] + h["rel"], key=lambda k: (BOOK_ORDER[hadiths[k]["book"]], int(hadiths[k]["num"])))
    # overlapping sets often share their lead hadith: keep the one with the most chains
    seen_lead = set()
    turuq = [h for h in turuq if lead(h) not in seen_lead and not seen_lead.add(lead(h))]
    dump([[lead(h), h["set"]["n_chains"], 1 + len(h["rel"]), "".join(BOOKS[b][0] for b in h["set"]["books"]),
           h["set"]["madar"] or "", len(h["set"]["companions"]), h["spread"]["n_hadith"], h["spread"]["n_books"],
           snippet(hadiths[lead(h)], 90)] for h in turuq], SITE_DATA / "turuq.json")

    index = {k: [h["kitab"], h["g"], h["label"]] for k, h in hadiths.items()}
    alias = {f"{BOOKS[h['book']][0]}{a}": k for k, h in hadiths.items() for a in h["aliases"]
             if f"{BOOKS[h['book']][0]}{a}" not in hadiths}
    meta = {
        "books": {b: {"title": t, "prefix": pre, "compiler": c, "node": COMPILER[b],
                      "kitabs": sorted(kitabs[b].values(), key=lambda r: r["no"])}
                  for b, (pre, t, c) in BOOKS.items()},
        "index": index, "alias": alias, "directory": directory,
        "gshard": gshard, "narr_shards": NARR_SHARDS,
        "grade_sources": GRADE_SOURCES,
        **({"sharh": load(SHARH / "langs.json")} if (SHARH / "langs.json").exists() else {}),
    }
    dump(meta, SITE_DATA / "meta.json")
    print(f"site data: {len(hadiths)} hadiths in {len(shards)} shards, muttafaq {muttafaq}, sitta {sitta}, "
          f"{len(directory)} narrators in {len(nshards)} shards; awali {({b: {n: len(v) for n, v in sorted(by_len.items())} for b, by_len in awali.items()})}; "
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
