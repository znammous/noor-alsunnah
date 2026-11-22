#!/usr/bin/env python3
"""مقارنة منهج «معالم السنة النبوية» في حذف المكرر بمنهج الموقع.

منهج الموقع (pipeline/build_site.py، قسم الإحصاءات): الحديث مكرر إذا ربطه البرنامج (rel) بحديث قبله
وشاركه في متنه بما لا يقل عن 0.3 من وزن كلماته النادرة.

يقيس:
  1. الحديث الواحد بأرقام متعددة في «المعالم» ([خ ٤٣٣، ٣٣٨٠]، أو ق: خ و م): هل يعدّها منهجنا حديثًا واحدًا؟
  2. ما بقي مكررًا داخل «المعالم» بمنهجنا (حديثان من «المعالم» يرجعان إلى حديث واحد).
  3. أرقام المؤلف في مقدمته (2131 للصحيحين، 3691 من التسعة، 230 من الخمسة الباقية).
  4. التغطية: كم من أحاديثنا «بدون المكرر» يمثلها «المعالم».

المخرج: data/raw/maalim/compare.json  وتقرير promo/maalim-method.html
"""
import html
import json
import math
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw" / "maalim"
DIAC = re.compile(r"[ؐ-ًؚ-ٰٟۖ-ۭـ]")
BOOK_ORDER = {b: i for i, b in enumerate(
    ["bukhari", "muslim", "abudawud", "tirmidhi", "nasai", "ibnmajah", "ahmad", "muwatta", "darimi"])}
PREFIX = {"خ": "b", "م": "m", "د": "d", "دا": "d", "ت": "t", "ن": "n", "جه": "j", "مي": "r"}
NINE_SYM = {"خ", "م", "د", "دا", "ت", "ن", "جه", "مي", "حم", "ط"}
BOOK_AR = {"bukhari": "البخاري", "muslim": "مسلم", "abudawud": "أبو داود", "tirmidhi": "الترمذي",
           "nasai": "النسائي", "ibnmajah": "ابن ماجه", "ahmad": "أحمد", "muwatta": "الموطأ", "darimi": "الدارمي"}


def strip(t):
    return DIAC.sub("", t or "")


def main():
    hadiths = {h["key"]: h for h in json.load(open(ROOT / "data" / "work" / "corpus.json"))["hadiths"]}
    by_num = {}
    for k, h in hadiths.items():
        for n in [h["num"]] + h["aliases"]:
            by_num.setdefault((k[0], str(n)), k)

    # ---- منهج الموقع كما في build_site.py ----
    norm = lambda t: re.sub("[إأآ]", "ا", strip(t)).replace("ة", "ه").replace("ى", "ي")
    mw = {k: set(re.findall(r"[ء-ي]{2,}", norm(" ".join(p["text"][p["matn"][0]:p["matn"][1]]
                                                               for p in h["parts"] if p.get("matn")))))
          for k, h in hadiths.items()}
    df = Counter(w for ws in mw.values() for w in ws)
    rarity = {w: math.log(len(hadiths) / c) for w, c in df.items()}
    weight = lambda ws: sum(rarity[w] for w in ws)
    whole = {k: weight(ws) for k, ws in mw.items()}
    seq = {k: i for i, k in enumerate(sorted(hadiths, key=lambda k: (BOOK_ORDER[hadiths[k]["book"]],
                                                                    int(hadiths[k]["num"]), k)))}

    def same_matn(a, b):
        A, B = mw[a], mw[b]
        return not A or not B or weight(A & B) >= 0.3 * min(whole[a], whole[b])

    rel = {k: set(r for r in h["rel"] if r in hadiths) for k, h in hadiths.items()}
    for k in list(rel):
        for r in list(rel[k]):
            rel[r].add(k)

    def same(a, b):
        """حديث واحد بمنهجنا: الرابط نفسه أو رابط مباشر مع اشتراك المتن."""
        return a == b or (b in rel[a] and same_matn(a, b))

    # أصل الحديث بمنهجنا: نتبع «مكرر حديثٍ قبله» إلى أول موضع
    root_cache = {}

    def root(k):
        path = []
        while k not in root_cache:
            path.append(k)
            prev = [r for r in rel[k] if seq[r] < seq[k] and same_matn(k, r)]
            if not prev:
                root_cache[k] = k
                break
            k = min(prev, key=seq.get)
        r = root_cache[k]
        for p in path:
            root_cache[p] = r
        return r

    maalim = {h["seq"]: h for h in json.load(open(RAW / "maalim.json"))}
    links = json.load(open(RAW / "maalim_links.json"))
    ok = lambda l: l["score"] >= 0.5 or l["how"] == "number-weak"

    # ---- 1. الحديث الواحد بأرقام متعددة ----
    pair_stat = Counter()
    disagree = []
    for L in links:
        h = maalim[L["seq"]]
        cited = defaultdict(set)              # book prefix -> Jami' keys by the cited numbers
        for r in h["refs"]:
            p = PREFIX.get(r["sym"])
            for n in r.get("nums") or []:
                k = by_num.get((p, str(n))) if p else None
                if k:
                    cited[p].add(k)
        # لا يُقارن إلا رقم يشهد نصُّه بأنه المقصود (يحذف أرقامًا شوّهها OCR):
        # متن «الجامع» يشارك نص «المعالم» أو زياداته بنسبة 0.3 من وزن الكلمات النادرة، كقاعدتنا
        M = set(re.findall(r"[\u0621-\u064A]{2,}", norm((h["text"] or "") + " " + (h["extra"] or ""))))
        M = {w for w in M if w in rarity}
        verified = {l["key"] for l in L["links"] if ok(l)}
        fits = lambda k: k in verified or (mw[k] and weight(mw[k] & M) >= 0.3 * min(whole[k], weight(M) or 1))
        keys = {p: {k for k in ks if fits(k)} for p, ks in cited.items()}
        dropped = sum(len(ks) for ks in cited.values()) - sum(len(ks) for ks in keys.values())
        pair_stat[("dropped_unverified", True)] += dropped
        for p, ks in keys.items():
            ks = sorted(ks, key=seq.get)
            for a, b in zip(ks, ks[1:]):
                s = same(a, b) or root(a) == root(b)
                linked = b in rel[a]
                pair_stat[("same_book", s)] += 1
                if not s:
                    pair_stat[("same_book_false_rel", linked)] += 1
                    disagree.append([h["label"], a, b, "same_book", linked])
        # ق: البخاري ومسلم
        if h["sym"] == "ق" and keys.get("b") and keys.get("m"):
            bs = [k for k in keys["b"] if k in verified] or sorted(keys["b"], key=seq.get)
            ms = [k for k in keys["m"] if k in verified] or sorted(keys["m"], key=seq.get)
            s = any(same(a, b) or root(a) == root(b) for a in bs for b in ms)
            pair_stat[("bukhari_muslim", s)] += 1
            if not s:
                linked = any(b in rel[a] for a in bs for b in ms)
                pair_stat[("bm_false_rel", linked)] += 1
                disagree.append([h["label"], bs[0], ms[0], "bukhari_muslim", linked])

    # ---- 2. المكرر الباقي داخل «المعالم» ----
    # زوجان من «المعالم» مكرران إذا كان بين موضعيهما في «الجامع» رابط مباشر بمنهجنا (لا سلسلة روابط،
    # لأن التسلسل يجمع أحاديث صحابة مختلفين)
    keys_of = {L["seq"]: {l["key"] for l in L["links"] if ok(l) and l["key"] in hadiths} for L in links}
    owner = defaultdict(set)
    for sq, ks in keys_of.items():
        for k in ks:
            owner[k].add(sq)
    pairs = set()
    for sq, ks in keys_of.items():
        for k in ks:
            for x in {k} | {r for r in rel[k] if same_matn(k, r)}:
                for other in owner.get(x, ()):
                    if other != sq:
                        pairs.add(tuple(sorted((sq, other))))
    dups = []
    for a_, b_ in sorted(pairs):
        hs = [maalim[a_], maalim[b_]]
        dups.append({"labels": [h["label"] for h in hs], "babs": [h["bab"] for h in hs],
                     "kitab_same": hs[0]["kitab"] == hs[1]["kitab"],
                     "texts": [h["text"][:140] for h in hs]})

    # ---- 3. أرقام المؤلف ----
    real = [h for h in maalim.values() if not h["empty"]]
    sahihayn = [h for h in real if h["sym"] in ("ق", "خ", "م")]
    muallaq = [h for h in sahihayn if h["sym"] == "خ" and h["refs"] and all("bab" in r for r in h["refs"])]
    nine = [h for h in real if any(r["sym"] in NINE_SYM for r in h["refs"])]
    by_link = {L["seq"]: L for L in links}
    nine_linked = [h for h in real if any(ok(l) and l["key"] in hadiths for l in by_link[h["seq"]]["links"])]
    five_only = [h for h in real if h["refs"] and not any(r["sym"] in NINE_SYM for r in h["refs"])]
    author = {"entries": len(real), "sahihayn": len(sahihayn), "muallaq": len(muallaq),
              "sahihayn_without_muallaq": len(sahihayn) - len(muallaq),
              "nine_by_refs": len(nine), "nine_by_links": len(nine_linked), "five_only": len(five_only)}

    # ---- 4. التغطية بمنهجنا ----
    marfu = lambda k: hadiths[k]["type"] in ("مرفوع", "قدسي")
    covered = {root(l["key"]) for L in links for l in L["links"] if ok(l) and l["key"] in hadiths}
    cover = {}
    for name, books in [("sahihayn", {"bukhari", "muslim"}), ("nine", set(BOOK_ORDER))]:
        keys = [k for k in hadiths if hadiths[k]["book"] in books and marfu(k)]
        roots = {root(k) for k in keys if hadiths[root(k)]["book"] in books}
        cover[name] = {"our_marfu_uniq": len(roots), "covered": len(roots & covered)}
    per_book = {}
    for b in BOOK_ORDER:
        keys = [k for k in hadiths if hadiths[k]["book"] == b and marfu(k)]
        roots = {root(k) for k in keys}
        per_book[b] = [len(roots), len(roots & covered)]

    res = {"pairs": {f"{k}:{s}": v for (k, s), v in pair_stat.items()}, "disagree": disagree,
           "dups": dups, "author": author, "cover": cover, "per_book": per_book}
    (RAW / "compare.json").write_text(json.dumps(res, ensure_ascii=False, indent=1))
    report(res, hadiths, maalim)
    print(json.dumps({k: v for k, v in res.items() if k not in ("disagree", "dups")}, ensure_ascii=False, indent=1),
          f"\ndisagree {len(disagree)}  dup groups {len(dups)}", file=sys.stderr)


def snippet(h, n=110):
    t = " ".join(p["text"][p["matn"][0]:p["matn"][1]] for p in h["parts"] if p.get("matn")) or h["parts"][0]["text"]
    return strip(t)[:n]


def report(res, hadiths, maalim):
    e = html.escape
    P = res["pairs"]
    sb_t, sb_f = P.get("same_book:True", 0), P.get("same_book:False", 0)
    bm_t, bm_f = P.get("bukhari_muslim:True", 0), P.get("bukhari_muslim:False", 0)
    pct = lambda a, b: f"{100 * a / max(a + b, 1):.1f}%"
    A = res["author"]
    rows_dis = "".join(
        f"<tr><td>{e(l)}</td><td>{e(kind == 'same_book' and 'كتاب واحد' or 'البخاري ومسلم')}<br>{'مربوطان في البرنامج' if linked else 'غير مربوطين'}</td>"
        f"<td><b>{a}</b> {e(snippet(hadiths[a]))}</td><td><b>{b}</b> {e(snippet(hadiths[b]))}</td></tr>"
        for l, a, b, kind, linked in res["disagree"][:200])
    rows_dup = "".join(
        f"<tr><td>{'، '.join(map(e, d['labels']))}</td><td>{'<br>'.join(e(x or '') for x in d['babs'])}</td>"
        f"<td>{'<br>'.join(e(x) for x in d['texts'])}</td></tr>" for d in res["dups"][:200])
    rows_book = "".join(f"<tr><td>{BOOK_AR[b]}</td><td>{u:,}</td><td>{c:,}</td><td>{pct(c, u - c)}</td></tr>"
                        for b, (u, c) in res["per_book"].items())
    C = res["cover"]
    doc = f"""<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>منهج المعالم ومنهجنا</title>
<style>
:root{{--bg:#fbfaf7;--fg:#1d2433;--muted:#5b6478;--line:#e3e0d8;--navy:#1f3a5f;--card:#fff}}
@media (prefers-color-scheme:dark){{:root{{--bg:#12161d;--fg:#e8e6e1;--muted:#a3abba;--line:#2b3240;--navy:#9cc0ea;--card:#1a1f28}}}}
body{{margin:0;background:var(--bg);color:var(--fg);font:16px/1.8 "Noto Naskh Arabic","Amiri",serif}}
main{{max-width:1050px;margin:auto;padding:24px 16px}} h1,h2{{color:var(--navy)}}
.cards{{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}}
.card{{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 16px}}
.card b{{font-size:1.6em;color:var(--navy);display:block}}
table{{border-collapse:collapse;width:100%;background:var(--card);font-size:.92em}}
td,th{{border:1px solid var(--line);padding:6px 8px;vertical-align:top}} th{{background:var(--line)}}
.wrap{{overflow-x:auto}} p.note{{color:var(--muted)}}
</style></head><body><main>
<h1>منهج «معالم السنة النبوية» في حذف المكرر، مقارنًا بمنهج الموقع</h1>

<h2>المنهجان</h2>
<div class="wrap"><table>
<tr><th></th><th>«المعالم» (صالح أحمد الشامي)</th><th>الموقع</th></tr>
<tr><td>المكرر</td><td><b>اصطلاحًا</b> (في مشروع «تقريب السنة»): ما رواه الصحابي نفسه وتكرر في الكتاب الواحد أو في الكتب الأربعة عشر؛ فحديث صحابي آخر حديث مستقل.<br>
<b>فعلًا</b> (في «المعالم»): يُكتفى بالمعنى مرة واحدة ولو اختلف الصحابي، ويُذكر أحد المتقاربين أو المتطابقين في المضمون.</td>
<td>ما ربطه برنامج «الجامع» بحديث قبله (روابط التخريج، وهي للصحابي نفسه غالبًا) وشاركه في متنه بنسبة 0.3 فأكثر من وزن كلماته النادرة. لا يُدمج حديثا صحابيين مختلفين، ولا يُنتقى.</td></tr>
<tr><td>الغاية</td><td>كتاب يحوي مجمل السنة: أحاديث كل باب بحيث تغطي <b>كل الأحكام وكل المعاني</b> فيه، لا كل الأحاديث.</td><td>عدّ الأحاديث «بدون المكرر» في كل كتاب وفي التسعة مجتمعة، دون حذف شيء.</td></tr>
<tr><td>الطريقة</td><td>نظر بشري في أحاديث كل باب في الكتب الستة التي حوت الأربعة عشر.</td><td>آلية، قابلة للإعادة، بعتبة موثقة في صفحة «المنهجية».</td></tr>
<tr><td>النتيجة</td><td>114,194 → 28,430 (بحذف المكرر اصطلاحًا) → 3,921 (بحذف المكرر فعلًا والمتقارب)</td><td>التسعة: 16,375 بدون المكرر، منها 13,278 مرفوعًا</td></tr>
</table></div>
<p class="note">فمنهجنا يقابل المرحلة الأولى من مشروع الشيخ (المكرر اصطلاحًا)، لا «المعالم» نفسه. ولذلك فالمقارنة الصحيحة: (أ) هل يتفق المنهجان فيما جعله الشيخ حديثًا واحدًا؟ (ب) هل بقي في «المعالم» مكرر بمنهجنا؟</p>

<h2>1. ما جعله الشيخ حديثًا واحدًا: هل يعدّه منهجنا كذلك؟</h2>
<div class="cards">
<div class="card">أرقام متعددة من كتاب واحد تحت حديث واحد<b>{pct(sb_t, sb_f)}</b>اتفاق ({sb_t:,} من {sb_t + sb_f:,} زوج)</div>
<div class="card">المتفق عليه (ق): رقما البخاري ومسلم<b>{pct(bm_t, bm_f)}</b>اتفاق ({bm_t:,} من {bm_t + bm_f:,})</div>
</div>
<p class="note">الخلاف هنا يعني أن منهجنا يعدّ الموضعين حديثين، والشيخ جعلهما حديثًا واحدًا (رواية أخرى أو زيادة أو قطعة من الحديث). أمثلة (أول 150):</p>
<div class="wrap"><table><tr><th>المعالم</th><th>النوع</th><th>الموضع الأول</th><th>الموضع الثاني</th></tr>{rows_dis}</table></div>

<h2>2. هل بقي في «المعالم» مكرر بمنهجنا؟</h2>
<div class="cards"><div class="card">أزواج من «المعالم» يعدّها منهجنا حديثًا واحدًا<b>{len(res['dups'])}</b></div></div>
<p class="note">كل صف: أحاديث من «المعالم» رُبطت بمواضع يعدّها منهجنا حديثًا واحدًا. بعضها مقصود (حديث طويل يُقطَّع في أبوابه)، وبعضها خطأ ربط، وبعضها تكرار فعلي.</p>
<div class="wrap"><table><tr><th>أرقام المعالم</th><th>الأبواب</th><th>نصوص المعالم (OCR)</th></tr>{rows_dup}</table></div>

<h2>3. أرقام المؤلف في مقدمته</h2>
<div class="wrap"><table><tr><th>البيان</th><th>قول المؤلف</th><th>المستخرج</th></tr>
<tr><td>عدد الأحاديث</td><td>3,921</td><td>{A['entries']:,} مدخلًا (بالأرقام المكررة واللواحق «م»، دون الرقمين الفارغين)</td></tr>
<tr><td>أحاديث الصحيحين</td><td>2,131</td><td>{A['sahihayn']:,} مرموزًا بـ(ق/خ/م)، منها {A['muallaq']:,} من معلقات البخاري المحالة بالكتاب والباب؛ فبدونها {A['sahihayn_without_muallaq']:,}</td></tr>
<tr><td>من الكتب التسعة</td><td>3,691</td><td>{A['nine_by_refs']:,} بإحالة مقروءة إلى أحد التسعة؛ {A['nine_by_links']:,} مربوطًا بحديث منها في «الجامع»</td></tr>
<tr><td>من الخمسة الباقية وحدها</td><td>230</td><td>{A['five_only']:,}</td></tr>
</table></div>

<h2>4. كم من أحاديثنا «بدون المكرر» يمثّلها «المعالم»؟ (المرفوع)</h2>
<div class="cards">
<div class="card">الصحيحان<b>{C['sahihayn']['covered']:,} / {C['sahihayn']['our_marfu_uniq']:,}</b>{pct(C['sahihayn']['covered'], C['sahihayn']['our_marfu_uniq'] - C['sahihayn']['covered'])}</div>
<div class="card">الكتب التسعة<b>{C['nine']['covered']:,} / {C['nine']['our_marfu_uniq']:,}</b>{pct(C['nine']['covered'], C['nine']['our_marfu_uniq'] - C['nine']['covered'])}</div>
</div>
<div class="wrap"><table><tr><th>الكتاب</th><th>المرفوع بدون المكرر (منهجنا)</th><th>منها في «المعالم»</th><th>النسبة</th></tr>{rows_book}</table></div>
<p class="note">«الممثَّل» = الحديث بدون المكرر الذي ربط «المعالم» أحد مواضعه. وما لم يمثَّل حذفه الشيخ لأن غيره يغني عنه في الحكم أو المعنى (المكرر فعلًا)، وهذا هو الفرق الجوهري بين المنهجين.</p>
</main></body></html>"""
    out = ROOT / "promo" / "maalim-method.html"
    out.write_text(doc)
    print("report:", out, file=sys.stderr)


if __name__ == "__main__":
    main()
