/* نور السنة — static single-page app (no build step). */
(() => {
  "use strict";

  // ---------- config ----------
  // When the site is deployed, point this at a tiny counter endpoint (Cloudflare Worker,
  // Firebase function, ...) to collect "most viewed / most searched" indicators.
  // It receives POST {type: "view"|"search", key} and GET returns {views: [[key,n]], searches: [[q,n]]}.
  const ANALYTICS_ENDPOINT = window.ANALYTICS_ENDPOINT || null;
  const PAGE = 40;
  const LOADING = '<div class="loading" role="status" aria-label="جارٍ التحميل"><span class="fill" data-t="نور السنة">نور السنة</span></div>';
  const CONTACT = "zuhair.nammous@gmail.com";
  const mailto = (subject, body) => `mailto:${CONTACT}?subject=${encodeURIComponent(subject)}${body ? `&body=${encodeURIComponent(body)}` : ""}`;

  const BOOKS = ["bukhari", "muslim", "abudawud", "tirmidhi", "nasai", "ibnmajah", "ahmad", "muwatta", "darimi"];
  const BOOK = { bukhari: "صحيح البخاري", muslim: "صحيح مسلم", abudawud: "سنن أبي داود", tirmidhi: "جامع الترمذي", nasai: "سنن النسائي", ibnmajah: "سنن ابن ماجه",
    ahmad: "مسند أحمد", muwatta: "موطأ مالك", darimi: "مسند الدارمي" };
  const AUTHOR = { bukhari: "البخاري", muslim: "مسلم", abudawud: "أبو داود", tirmidhi: "الترمذي", nasai: "النسائي", ibnmajah: "ابن ماجه",
    ahmad: "أحمد", muwatta: "مالك", darimi: "الدارمي" };
  const PREFIX = { bukhari: "b", muslim: "m", abudawud: "d", tirmidhi: "t", nasai: "n", ibnmajah: "j", ahmad: "a", muwatta: "w", darimi: "r" };
  const BOOK_OF = Object.fromEntries(Object.entries(PREFIX).map(([b, p]) => [p, b]));
  const BOOK_SHORT = Object.fromEntries(Object.entries(PREFIX).map(([b, p]) => [p, AUTHOR[b]]));
  const LAST_NUMBER = { b: 7563, m: 3033, d: 5274, t: 3956, n: 5774, j: 4341, a: 28295, w: 3676, r: 3546 };
  const NUMBERING = { bukhari: "ترقيم فتح الباري", muslim: "ترقيم محمد فؤاد عبد الباقي", abudawud: "ترقيم محمد محيي الدين عبد الحميد",
    tirmidhi: "ترقيم أحمد شاكر", nasai: "ترقيم برنامج الجامع", ibnmajah: "ترقيم محمد فؤاد عبد الباقي",
    ahmad: "ترقيم برنامج الجامع", muwatta: "رواية يحيى الليثي، ترقيم محمد مصطفى الأعظمي", darimi: "ترقيم حسين سليم أسد" };
  const SAHIHAYN = new Set(["bukhari", "muslim"]);
  // Abdullah son of Ahmad transmits the Musnad; his own additions (zawa'id) end with him
  const ZAWAID = "من زوائد عبد الله بن أحمد";
  // where a book's chains end: the compiler's node (Malik, Ahmad and al-Darimi are narrators too)
  const endOf = (k, c) => (c.z ? [] : [META.books[bookOf(k)].node]);
  const bookOf = (k) => BOOK_OF[k[0]];
  const CLS_LABEL = {
    nabi: "النبي ﷺ", sahabi: "صحابي", thiqa: "ثقة", saduq: "صدوق", maqbul: "مقبول / مجهول الحال",
    weak: "تُكلِّم فيه", unknown: "لم تتوفر رتبته", imam: "صاحب الكتاب", taliq: "موضع تعليق", mubham: "مبهم",
  };
  // Ibn Hajar's twelve ranks, in his words from the introduction of «تقريب التهذيب»
  const RANKS = [
    ["الصحابة", "الصحابة، فأُصرّح بذلك لشرفهم.", "لا يُبحث عن عدالة الصحابي؛ فالصحابة كلهم عدول عند أهل السنة."],
    ["من أُكِّد مدحه", "من أُكِّد مدحه: إما بأفعل كأوثق الناس، أو بتكرير الصفة لفظًا كثقة ثقة، أو معنًى كثقة حافظ.", "أعلى درجات القبول بعد الصحابة، وحديثه صحيح."],
    ["ثقة", "من أُفرد بصفة، كثقة أو متقن أو ثبت أو عدل.", "حديثه صحيح."],
    ["صدوق", "من قصر عن درجة الثالثة قليلًا، وإليه الإشارة بصدوق، أو لا بأس به، أو ليس به بأس.", "عدل لكن ضبطه دون ضبط الثقة، وحديثه حسن في الجملة."],
    ["صدوق يهم", "من قصر عن الرابعة قليلًا، وإليه الإشارة بصدوق سيئ الحفظ، أو صدوق يهم، أو له أوهام، أو يخطئ، أو تغيّر بأخرة. ويلتحق بذلك من رُمي بنوع من البدعة كالتشيع والقدر والنصب والإرجاء والتجهم، مع بيان الداعية من غيره.", "يُحتجّ به فيما لم يُخطئ فيه، ويُنظر في حديثه عند التفرد والمخالفة."],
    ["مقبول", "من ليس له من الحديث إلا القليل، ولم يثبت فيه ما يُترك حديثه من أجله، وإليه الإشارة بلفظ: مقبول حيث يُتابَع، وإلا فليّن الحديث.", "ليس طعنًا فيه، بل لقلة حديثه وعدم وقوف ابن حجر على توثيق معتبر له: فإذا وافقه غيره قُبل حديثه، وإذا تفرّد كان ليّنًا. وقد خالفه بعض المتأخرين في كثير ممن روى لهم الشيخان، فعدّوا إخراجهما لهم توثيقًا."],
    ["مستور / مجهول الحال", "من روى عنه أكثر من واحد ولم يُوثَّق، وإليه الإشارة بلفظ مستور أو مجهول الحال.", "عُرفت عينه برواية اثنين فأكثر عنه، ولم تُعرف حاله في الضبط والعدالة."],
    ["ضعيف", "من لم يوجد فيه توثيق لمعتبر، ووُجد فيه إطلاق الضعف ولو لم يُفسَّر، وإليه الإشارة بلفظ ضعيف.", "لا يُحتجّ به منفردًا، ويُعتبر به في المتابعات والشواهد."],
    ["مجهول", "من لم يرو عنه غير واحد ولم يُوثَّق، وإليه الإشارة بلفظ مجهول.", "مجهول العين: لم يرو عنه إلا راوٍ واحد."],
    ["متروك", "من لم يُوثَّق البتة، وضُعِّف مع ذلك بقادح، وإليه الإشارة بمتروك، أو متروك الحديث، أو واهي الحديث، أو ساقط.", "شديد الضعف، لا يُعتبر به ولا يتقوّى حديثه بغيره."],
    ["متهم بالكذب", "من اتُّهم بالكذب.", "حديثه في غاية الضعف."],
    ["كذاب / وضّاع", "من أُطلق عليه اسم الكذب والوضع.", "حديثه موضوع."],
  ];
  // the rank (1-12) of a verdict as Ibn Hajar words it; its first clause decides
  function rankLevel(rank, cls) {
    if (cls === "sahabi") return 1;
    const t = norm(rank || ""), head = norm(String(rank || "").split(/[،,؛]/)[0]).split(/ الا | لكن /)[0];
    const RULES = [[12, /كذاب|وضاع|يضع الحديث|كذبوه|تكذيبه/], [11, /متهم|رمي بالوضع|اتهم/], [10, /متروك|تركوه|واه|ساقط/],
      [9, /مجهول(?! الحال)|^(و?لا (يعرف|تعرف))$/], [7, /مستور|مجهول الحال|لا (يعرف|تعرف) حال/],
      [5, /صدوق.*(يهم|يخطي|اوهام|سيي الحفظ|تغير|اختلط|رمي|يدلس|يتشيع|خطا|لين)/], [6, /مقبول|لين/],
      [8, /ضعيف|ضعف|ليس بالقوي|منكر الحديث/], [4, /صدوق|لا باس به|ليس به باس/],
      [2, /اوثق|ثقه ثقه|ثقه (حافظ|ثبت|متقن|حجه|امام)|ثبت حجه|حافظ (حجه|ثبت)|امام حافظ|امير المومنين في الحديث|مجمع علي ثقته|احد الحفاظ/],
      [3, /ثقه|ثبت|متقن|عدل|حافظ|امام/]];
    for (const scope of [head, t]) for (const [lv, re] of RULES) if (re.test(scope)) {
      // «ثقة، حافظ»: the praise doubled after the first clause still makes the second rank
      return lv === 3 && RULES[9][1].test(t) ? 2 : lv;
    }
    return 0;
  }

  // terms the narrator pages and the follow-up notes use
  const TERMS = {
    mutabaa: ["المتابعة", "أن يوافق راوٍ غيرَه في رواية الحديث نفسه. فإن رواه غيره عن شيخه نفسه فهي «متابعة تامة»، وإن رواه غيره عن شيخ أعلى منه في الإسناد (كشيخ شيخه أو الصحابي) فهي «متابعة قاصرة». والمتابعة تدل على أن الراوي لم ينفرد بالحديث ولم يخطئ فيه، ولذلك قال ابن حجر في المقبول: «حيث يُتابَع»."],
    shahid: ["الشاهد", "أن يُروى معنى الحديث عن صحابي آخر. فالمتابعة تكون في الرواة دون الصحابي، والشاهد يكون بتعدد الصحابي."],
    maqrun: ["المقرون", "أن يذكر المصنف الراوي مع غيره في موضع واحد من الإسناد: «حدثنا فلان وفلان قالا…». فلا يكون الحديث معتمدًا عليه وحده، والشيخان يفعلان ذلك كثيرًا مع من دون الثقة."],
    usul: ["الأصول والمتابعات", "يقدّم الشيخان في الباب الإسنادَ الذي يعتمدانه (الأصل)، ثم يذكران بعده طرقًا أخرى للحديث نفسه تقويةً وبيانًا (المتابعات والشواهد). ويتساهلان في رجال المتابعات ما لا يتساهلان في رجال الأصول، ولذلك يقع فيها من هو دون الثقة."],
    fard: ["التفرد", "أن ينفرد الراوي بالحديث فلا يرويه غيره. وتفرد من دون الثقة موضع نظر، وإخراج الشيخين له قد يكون لأنهما عرفا من حاله أو من الحديث ما لم يذكره غيرهما."],
    tadlis: ["التدليس", "أن يروي الراوي عمن لقيه ما لم يسمعه منه بلفظ يوهم السماع، كـ«عن» و«قال». فلا يُقبل من المدلس إلا ما صرّح فيه بالسماع («حدثنا»، «سمعت»)، وما في الصحيحين من عنعنة المدلسين محمول على ثبوت السماع من طريق أخرى."],
    ikhtilat: ["الاختلاط", "أن يسوء حفظ الراوي في آخر عمره لكبر أو مرض أو ذهاب كتب. فيُقبل منه ما رواه قبل الاختلاط ويُردّ ما بعده، وأهل العلم يميّزون من سمع منه قديمًا ممن سمع منه بعد اختلاطه."],
  };
  const termLink = (k) => `<a href="#/terms" title="${esc(TERMS[k][1])}">${TERMS[k][0]}</a>`;
  // chains are described by the weakest Ibn Hajar grade among their narrators (not a verdict on the hadith)
  const CHAIN_LABEL = { thiqat: ["رجاله ثقات", "ok"], saduq: ["فيه من قيل فيه: صدوق", "mid"], mutakallam: ["فيه من تُكلِّم فيه", "low"], unknown: ["فيه من لم تُذكر رتبته", ""] };
  const SPECIAL = new Set(["nabi", ...BOOKS]);
  const totalOf = (v) => v[2].reduce((a, n) => a + n, 0);
  const countsLabel = (counts) => BOOKS.map((b, i) => (counts[i] ? `${AUTHOR[b]} ${fmt(counts[i])}` : "")).filter(Boolean).join(" · ");

  // ---------- utils ----------
  const $ = (s, r = document) => r.querySelector(s);
  const app = $("#app");
  const fmt = (n) => Number(n).toLocaleString("en-US");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let META = null;
  const hnum = (k) => (META && META.index[k] ? META.index[k][2] : k.slice(1));
  const hkey = (k) => `${BOOK_SHORT[k[0]]} ${hnum(k)}`;
  const clip = (s, n) => { s = String(s || ""); return s.length > n ? s.slice(0, n) + "…" : s; };

  function norm(s) {
    s = String(s || "")
      .replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ‌-‏]/g, "")
      .replace(/[إأآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ي")
      .replace(/[^ء-ي ]/g, " ")
      .replace(/(^|\s)بن(?=\s|$)/g, "$1ابن");
    return s.replace(/\s+/g, " ").trim();
  }

  function shortName(name) {
    const s = String(name || "").replace(/[‎‏]/g, "").trim();
    const w = s.split(/\s+/);
    return w.length > 5 ? w.slice(0, 5).join(" ") + "…" : s;
  }

  function shardOf(id) {
    let h = 0;
    for (const ch of id) h = (h * 31 + ch.codePointAt(0)) % 1000003;
    return h % 64;
  }

  // ---------- data ----------
  const cache = new Map();
  function getJSON(path) {
    if (!cache.has(path)) {
      cache.set(path, fetch(window.V ? `${path}?v=${window.V}` : path).then((r) => {
        if (!r.ok) throw new Error(path + " " + r.status);
        return r.json();
      }));
    }
    return cache.get(path);
  }
  const meta = async () => (META = await getJSON("data/meta.json"));
  const stats = () => getJSON("data/stats.json");
  // search files are per book; load only the books a view needs
  const searchIndex = (books = BOOKS) => Promise.all(books.map((b) => getJSON(`data/search/${b}.json`))).then((all) => all.flat());
  async function group(g) {
    const m = await meta();
    const shard = await getJSON(`data/g/${m.gshard[g]}.json`);
    return shard[g];
  }
  async function narrator(id) {
    const shard = await getJSON(`data/n/${shardOf(id)}.json`);
    return shard[id];
  }

  // ---------- analytics (optional) ----------
  function track(type, key) {
    try {
      const recent = JSON.parse(localStorage.getItem("recent") || "[]").filter((x) => x.key !== key || x.type !== type);
      recent.unshift({ type, key, t: Date.now() });
      localStorage.setItem("recent", JSON.stringify(recent.slice(0, 12)));
    } catch (_) { /* storage unavailable */ }
    if (ANALYTICS_ENDPOINT) {
      fetch(ANALYTICS_ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type, key }) }).catch(() => {});
    }
  }
  function recentViews() {
    try { return JSON.parse(localStorage.getItem("recent") || "[]"); } catch (_) { return []; }
  }

  // ---------- small renderers ----------
  function chip(id, nar) {
    const n = nar[id] || { name: id, cls: "unknown" };
    const linkable = !SPECIAL.has(id) && n.cls !== "taliq" && n.cls !== "mubham";
    const title = esc([n.rank, n.tadlis ? "موصوف بالتدليس" : "", n.ikhtilat ? "اختلط" : ""].filter(Boolean).join(" · ") || CLS_LABEL[n.cls] || "");
    const inner = `<span class="dot"></span>${esc(shortName(n.name))}${n.tadlis ? '<sup class="flag" title="مدلس">د</sup>' : ""}${n.ikhtilat ? '<sup class="flag" title="اختلط">خ</sup>' : ""}`;
    return linkable
      ? `<a class="chip cls-${n.cls}" href="#/n/${encodeURIComponent(id)}" title="${title}">${inner}</a>`
      : `<span class="chip cls-${n.cls}" title="${title}">${inner}</span>`;
  }
  function chainHTML(ids, nar, compiler) {
    const parts = ids.map((id) => chip(id, nar));
    if (compiler) parts.push(`<span class="chip cls-imam"><span class="dot"></span>${compiler}</span>`);
    return `<div class="chain">${parts.join('<span class="sep">←</span>')}</div>`;
  }
  function kpi(v, l, s) {
    return `<div class="panel kpi"><div class="v">${fmt(v)}</div><div class="l">${l}</div><div class="s">${s}</div></div>`;
  }
  // the top menu's sections and the pages under each, shown as tabs at the top of the page
  const NAV_OF = { home: /^\/$/, books: /^\/book/, narrators: /^\/(narrators|explore|compare|terms|n\/)/, hadiths: /^\/(turuq|awali|h\/)/, isnads: /^\/(chains|isnads)/, about: /^\/(about|tools)/ };
  const SUBNAV = {
    narrators: [["narrators", "فهرس الرواة"], ["explore", "ترتيب الرواة"], ["compare", "مقارنة الكتب"], ["terms", "مراتب الرواة"]],
    hadiths: [["turuq", "ترتيب الأحاديث"], ["awali", "الثلاثيات وعوالي الأسانيد"]],
    isnads: [["chains", "رجال الأسانيد"], ["isnads", "أشهر الأسانيد وأطوالها"]],
  };
  const subnav = (group, on) => `<nav class="subnav">${SUBNAV[group].map(([p, l]) => `<a href="#/${p}"${p === on ? ' class="on" aria-current="page"' : ""}>${l}</a>`).join("")}</nav>`;
  // what a researcher can ask of the site, one card per tool
  const TOOLS = [
    ["#/explore", "ترتيب الرواة", "من أكثر التابعين رواية؟ من أكثر رواة الكوفة؟ من رجال البخاري الذين لم يخرّج لهم مسلم؟"],
    ["#/compare", "مقارنة الكتب", "كيف يختلف حضور الرواة بين كتابين؟ وكم في كل كتاب من حديث بالمكرر وبدونه؟"],
    ["#/narrators", "فهرس الرواة", "ابحث عن راوٍ باسمه وصفِّ القائمة بالكتاب والرتبة"],
    ["#/turuq", "ترتيب الأحاديث", "ما أكثر الأحاديث أسانيدَ وصحابةً وانتشارًا في كتب السنة؟ وما أحاديث مدارٍ بعينه؟"],
    ["#/awali", "الثلاثيات وعوالي الأسانيد", "ما الأحاديث التي ليس بين المصنف والنبي ﷺ فيها إلا ثلاثة رواة؟"],
    ["#/chains", "رجال الأسانيد", "ما أسانيد أبي داود التي فيها راوٍ متكلَّم فيه؟ ومن الرواة الذين نزلت بهم؟"],
    ["#/isnads", "أشهر الأسانيد وأطوالها", "ما السلاسل الأكثر تكرارًا؟ وكم راويًا بين المصنف والنبي ﷺ في كل كتاب؟"],
    ["#/h/b1", "شجرة الحديث", "اكتب كلمة من المتن في البحث لترى أسانيد الحديث شجرةً ومداره ومتابعاته وشواهده"],
  ];
  const toolsHTML = () => `<div class="tools">${TOOLS.map(([href, t, q]) => `<a class="panel tool" href="${href}"><b>${t}</b><span>${q}</span></a>`).join("")}</div>`;
  const moreLink = (href, label = "عرض الترتيب كاملًا") => `<p class="more"><a class="btn gold" href="${href}">${label} ←</a></p>`;
  const hist = (rows, height = 150) => {
    const max = Math.max(...rows.map((r) => r[1]), 1);
    return `<div class="hist" style="height:${height}px">${rows.map(([label, v, title, href]) => {
      const tag = href ? "a" : "div";
      return `<${tag} class="col"${href ? ` href="${href}"` : ""} title="${esc(title || label)}: ${fmt(v)}"><i>${fmt(v)}</i><b style="height:${(100 * v) / max}%"></b><small>${esc(label)}</small></${tag}>`;
    }).join("")}</div>`;
  };
  function setSeg(sel, btn) { for (const b of document.querySelectorAll(`${sel} button`)) b.classList.toggle("on", b === btn); }

  // ---------- router ----------
  const routes = [
    [/^\/?$/, viewHome],
    [/^\/books$/, viewBooks],
    [new RegExp(`^/book/(${BOOKS.join("|")})$`), viewBook],
    [new RegExp(`^/book/(${BOOKS.join("|")})/(\\d+)(?:/(\\d+))?$`), viewKitab],
    [new RegExp(`^/h/([${Object.values(PREFIX).join("")}]\\d+)$`), viewHadith],
    [/^\/n\/([^/]+)(?:\/([ts])\/([^/]+))?$/, viewNarrator],
    [/^\/narrators$/, viewNarrators],
    [/^\/explore(?:\?(.*))?$/, viewExplore],
    [/^\/compare(?:\?(.*))?$/, (q) => viewExplore(q, "cmp")],
    [/^\/isnads$/, viewIsnads],
    [/^\/tools$/, viewTools],
    [/^\/turuq(?:\?(.*))?$/, viewTuruq],
    [/^\/awali(?:\?(.*))?$/, viewAwali],
    [/^\/chains(?:\?(.*))?$/, viewChains],
    [/^\/search\/(.*)$/, viewSearch],
    [/^\/terms$/, viewTerms],
    [/^\/about$/, viewAbout],
  ];
  // each history entry remembers its own scroll, so «back» returns to where the reader left off
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  let restoring = false, saveTimer = 0;
  function saveScroll() {
    clearTimeout(saveTimer);
    if (restoring) return;
    try { history.replaceState({ ...(history.state || {}), y: Math.round(scrollY) }, ""); } catch (_) {}
  }
  addEventListener("scroll", () => { clearTimeout(saveTimer); saveTimer = setTimeout(saveScroll, 250); }, { passive: true });
  addEventListener("pagehide", saveScroll);
  document.addEventListener("click", (e) => { if (e.target.closest && e.target.closest('a[href^="#"]')) saveScroll(); }, true);
  function go(hash) { saveScroll(); location.hash = hash; }
  function restoreScroll(y) {
    // trees and lists may still be growing; retry briefly until the page is tall enough
    const t0 = Date.now();
    const step = () => {
      scrollTo(0, y);
      if (Math.abs(scrollY - y) > 2 && Date.now() - t0 < 1500) requestAnimationFrame(step);
      else restoring = false;
    };
    step();
  }
  async function route() {
    const path = decodeURIComponent(location.hash.replace(/^#/, "")) || "/";
    clearTimeout(saveTimer);
    restoring = true;
    const savedY = (history.state && history.state.y) || 0;
    for (const a of document.querySelectorAll(".nav a")) {
      const nav = a.dataset.nav;
      a.classList.toggle("active", NAV_OF[nav].test(path));
    }
    for (const [re, fn] of routes) {
      const m = path.match(re);
      if (m) {
        app.innerHTML = LOADING;
        try { await meta(); await fn(...m.slice(1)); } catch (e) { console.error(e); app.innerHTML = `<div class="panel">تعذّر التحميل: ${esc(e.message)}</div>`; }
        restoreScroll(savedY);
        return;
      }
    }
    restoring = false;
    app.innerHTML = '<div class="panel">الصفحة غير موجودة.</div>';
  }
  window.addEventListener("hashchange", route);

  // ---------- dashboard ----------
  async function viewHome() {
    const S = await stats();
    const T = S.totals, N = S.nar;
    const bars = (rows, link = true) => {
      const max = Math.max(...rows.map((r) => r[1]), 1);
      return `<ul class="bars">${rows.map(([id, v]) => {
        const n = N[id] || { name: id, cls: "unknown" };
        const label = link ? `<a href="#/n/${encodeURIComponent(id)}" class="cls-${n.cls}"><span class="dot"></span>${esc(shortName(n.name))}</a>` : esc(id);
        return `<li><span class="name">${label}</span><span class="num">${fmt(v)}</span><span class="bar"><span style="width:${(100 * v) / max}%"></span></span></li>`;
      }).join("")}</ul>`;
    };
    const gradeTotal = S.grades.reduce((a, [, v]) => a + v, 0) || 1;
    const lenRows = (b) => S.chain_length[b].filter(([l]) => l >= 2 && l <= 10);
    const classRows = (b) => {
      const rows = S.chain_classes[b], tot = rows.reduce((a, [, v]) => a + v, 0) || 1;
      return `<div class="stack">${rows.map(([c, v]) => `<a href="#/chains?b=${b}&c=${c}" class="ch-${c}" style="width:${(100 * v) / tot}%" title="${CHAIN_LABEL[c][0]}: ${fmt(v)}"></a>`).join("")}</div>
        <div class="legend">${rows.map(([c, v]) => `<a href="#/chains?b=${b}&c=${c}"><i class="ch-${c}"></i>${CHAIN_LABEL[c][0]} ${fmt(v)}</a>`).join("")}</div>`;
    };

    app.innerHTML = `
      <div class="section-title" style="margin-top:0"><h1>مؤشرات أسانيد الكتب التسعة</h1><p>محسوبة من سلاسل الرواة نفسها</p></div>
      <div class="grid kpis">
        ${kpi(T.hadith, "حديثًا في الكتب التسعة", `${fmt(T.chains)} إسنادًا`)}
        ${kpi(T.narrators, "راويًا", `${fmt(T.narrators_shaykhayn)} من رجال الشيخين معًا`)}
        ${kpi(T.companions, "صحابيًا وصحابية", "في أسانيد الكتب التسعة")}
        ${kpi(T.muttafaq, "حديثًا متفقًا عليه", "من أحاديث مسلم، بحسب تخريج البرنامج")}
        ${kpi(T.tisa, "حديثًا رواه التسعة", `و${fmt(T.sitta)} رواه الستة، من أحاديث البخاري بحسب تخريج البرنامج`)}
        ${kpi(T.thulathiyyat, "من ثلاثيات البخاري", `و${fmt(T.thulathiyyat_ahmad)} حديثًا من ثلاثيات أحمد`)}
        ${kpi(T.mudallisun, "راويًا موصوفًا بالتدليس", `و${fmt(T.mukhtalitun)} ممن اختلط`)}
      </div>

      <div class="panel" style="margin-top:16px"><h2>أدوات الباحث</h2><p class="muted small">كل مؤشر في هذه الصفحة له ترتيب كامل في صفحته</p>${toolsHTML()}</div>

      <div class="panel" style="margin-top:16px"><h2>الكتب التسعة</h2>
        <div class="table-wrap"><table class="books-table"><thead><tr><th>الكتاب</th><th>الأحاديث</th><th>الأسانيد</th><th>الرواة</th></tr></thead>
        <tbody>${BOOKS.map((b) => `<tr><td><a href="#/book/${b}">${BOOK[b]}</a></td><td>${fmt(T.books[b].hadith)}</td><td>${fmt(T.books[b].chains)}</td><td>${fmt(T.books[b].narrators)}</td></tr>`).join("")}</tbody></table></div></div>

      <div class="grid g2" style="margin-top:16px">
        <div class="panel"><h2>الأكثر رواية</h2><p class="muted small">عدد الأحاديث التي ورد الراوي في أسانيدها في الكتب التسعة</p>${bars(S.top_narrators.slice(0, 12))}${moreLink("#/explore?m=r")}</div>
        <div class="panel"><h2>الصحابة الأكثر رواية</h2><p class="muted small">في الكتب التسعة، مع المكرر</p>${bars(S.top_companions.slice(0, 12))}${moreLink("#/explore?t=1&m=r")}</div>
      </div>
      <div class="panel" style="margin-top:16px"><h2>أكثر الشيوخ الذين حدّث عنهم أصحاب الكتب</h2>
        <div class="seg" id="shf">${BOOKS.map((b, i) => `<button data-v="${b}" class="${i ? "" : "on"}">${AUTHOR[b]}</button>`).join("")}</div>
        <p class="muted small" id="shf-note"></p><div id="shf-bars"></div><p class="more"><a class="btn gold" id="shf-more" href="#/explore?b=bukhari&m=s">عرض الترتيب كاملًا ←</a></p></div>

      <div class="grid g2" style="margin-top:16px">
        <div class="panel"><h2>أشهر الأسانيد</h2><p class="muted small">أكثر السلاسل تكرارًا (الصحابي واثنان دونه)</p>
          <ul class="list">${S.top_isnads.slice(0, 10).map(([c, v]) => `<li><div class="meta-line"><span class="tag">${fmt(v)} إسنادًا</span></div>${chainHTML(c, N)}</li>`).join("")}</ul>${moreLink("#/isnads", "أشهر الأسانيد وأطوالها")}</div>
        <div class="panel"><h2>أكثر الرواة مدارًا</h2><p class="muted small">الراوي الذي تلتقي عنده طرق الحديث الواحد في الكتب التسعة ثم تتفرع عنه</p>${bars(S.top_madar.slice(0, 12))}${moreLink("#/explore?m=d")}</div>
      </div>

      <div class="grid g2" style="margin-top:16px">
        <div class="panel"><h2>الأكثر طرقًا في الكتب التسعة</h2>
          <ul class="list">${S.most_turuq.slice(0, 8).map((g) => `<li><div class="meta-line"><span class="tag ok">${fmt(g.n_chains)} إسنادًا</span><span>${fmt(g.n_hadiths)} رواية</span><span>${g.books.map((b) => BOOK[b]).join(" و")}</span></div>
            <a href="#/h/${g.first}" class="snip" style="color:inherit">${esc(g.snippet)}</a></li>`).join("")}</ul>${moreLink("#/turuq")}</div>
        <div class="panel"><h2>الأوسع انتشارًا في كتب السنة</h2><p class="muted small">أحاديث الكتب التسعة بحسب عدد رواياتها في تخريج برنامج الجامع</p>
          <ul class="list">${S.widest.slice(0, 8).map((g) => `<li><div class="meta-line"><span class="tag ok">${fmt(g.n_hadith)} رواية</span><span>في ${fmt(g.n_books)} كتابًا</span>${g.n_shawahid ? `<span>وله شواهد عن ${fmt(g.n_shawahid)} صحابيًا</span>` : ""}</div>
            <a href="#/h/${g.first}" class="snip" style="color:inherit">${esc(g.snippet)}</a></li>`).join("")}</ul>${moreLink("#/turuq?s=w")}</div>
      </div>

      <div class="grid g2" style="margin-top:16px">
        <div class="panel"><h2>رجال الأسانيد</h2><p class="muted small">وصف كل إسناد بأدنى رتبة فيه عند ابن حجر</p>
          ${BOOKS.map((b, i) => `<h3 class="muted"${i ? ' style="margin-top:12px"' : ""}>${BOOK[b]}</h3>${classRows(b)}`).join("")}
          <p class="muted small" style="margin-top:12px">اضغط على أي لون لعرض أسانيده ورواته. وصفٌ لرجال الأسانيد المفردة لا حكمٌ على الأحاديث: فأحاديث الصحيحين صحيحة بحكم الشيخين، وأحاديث بقية الكتب يُرجع في الحكم عليها إلى أحكام المحدثين.</p>${moreLink("#/chains", "أسانيد كل كتاب ورواتها")}</div>
        <div class="panel"><h2>رتب الرواة</h2><p class="muted small">تصنيف مبسّط لرتب الرواة عند ابن حجر في «التقريب»</p>
          <div class="stack">${S.grades.map(([c, v]) => `<a href="#/explore?c=${c}" class="cls-${c}" style="width:${(100 * v) / gradeTotal}%;background:var(--c)" title="${CLS_LABEL[c]}: ${fmt(v)}"></a>`).join("")}</div>
          <div class="legend">${S.grades.filter(([, v]) => v).map(([c, v]) => `<a href="#/explore?c=${c}" class="cls-${c}"><i style="background:var(--c)"></i>${CLS_LABEL[c]} ${fmt(v)}</a>`).join("")}</div>
          <h3 style="margin-top:18px">الرواة حسب الطبقة</h3>${hist(S.tabaqat.map(([label, v, t]) => [String(t), v, label, `#/explore?t=${encodeURIComponent(t === 1 ? "1" : `=${t}`)}`]))}
          <p class="muted small">1 = الصحابة … 12 = صغار الآخذين عن تبع الأتباع (طبقات ابن حجر). اضغط على رتبة أو طبقة لعرض رواتها</p>${moreLink("#/explore")}</div>
      </div>

      <div class="grid g2" style="margin-top:16px">
        <div class="panel"><h2>طول الإسناد (عدد الرواة بين المصنف والنبي ﷺ)</h2>
          ${BOOKS.map((b) => `<h3 class="muted">${BOOK[b]}</h3>${hist(lenRows(b).map(([l, v]) => [String(l), v, `${l} رواة`]), 80)}`).join("")}${moreLink("#/isnads", "أشهر الأسانيد وأطوالها")}</div>
        <div class="panel"><h2>وفيات الرواة</h2><p class="muted small">عدد الرواة بحسب سنة الوفاة (كل 25 سنة هجرية)</p>${hist(S.deaths.map(([y, v]) => [String(y), v, `${y}–${y + 24} هـ`]))}
          <h3 style="margin-top:14px">مدن الرواة</h3>${bars(S.cities.slice(0, 8), false)}${moreLink("#/explore", "ترتيب الرواة بالبلد والطبقة")}</div>
      </div>

      <div class="grid g2" style="margin-top:16px">
        <div class="panel"><h2>الأكثر بحثًا وزيارة</h2><div id="popular"></div></div>
        <div class="panel"><h2>الثلاثيات في الكتب التسعة</h2>
          <p class="muted small">ما بين المصنف والنبي ﷺ فيه ثلاثة رواة، وهو أعلى ما في أكثر الكتب التسعة</p>
          <ul class="bars">${BOOKS.map((b) => `<li><span class="name"><a href="#/awali?b=${b}">${BOOK[b]}</a></span><span class="num">${T.thulathiyyat_all[b] ? fmt(T.thulathiyyat_all[b]) : "—"}</span></li>`).join("")}</ul>
          ${moreLink("#/awali", "الثلاثيات وعوالي الأسانيد")}</div>
      </div>`;
    renderPopular();
    const showShaykhs = (b) => {
      $("#shf-note").textContent = `عدد الأسانيد التي حدّث بها ${AUTHOR[b]} عن كل شيخ`;
      $("#shf-bars").innerHTML = bars(S.top_shaykhs[b].slice(0, 10));
      $("#shf-more").href = `#/explore?b=${b}&m=s`;
    };
    showShaykhs("bukhari");
    $("#shf").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; setSeg("#shf", b); showShaykhs(b.dataset.v); });
  }

  async function renderPopular() {
    const box = $("#popular");
    if (!box) return;
    if (ANALYTICS_ENDPOINT) {
      try {
        const d = await (await fetch(ANALYTICS_ENDPOINT)).json();
        box.innerHTML = `<h3 class="muted">الأحاديث الأكثر زيارة</h3><ul class="bars">${(d.views || []).slice(0, 8).map(([k, n]) => `<li><span class="name"><a href="#/h/${k}">${hkey(k)}</a></span><span class="num">${fmt(n)}</span></li>`).join("")}</ul>
          <h3 class="muted" style="margin-top:12px">أكثر عبارات البحث</h3><ul class="bars">${(d.searches || []).slice(0, 8).map(([q, n]) => `<li><span class="name"><a href="#/search/${encodeURIComponent(q)}">${esc(q)}</a></span><span class="num">${fmt(n)}</span></li>`).join("")}</ul>`;
        return;
      } catch (_) { /* fall through */ }
    }
    const recent = recentViews();
    box.innerHTML = `<p class="notice">يُفعَّل هذا المؤشر بعد نشر الموقع وربطه بعدّاد الزيارات، فيُظهر الأحاديث الأكثر زيارة وأكثر عبارات البحث بين جميع المستخدمين.</p>
      ${recent.length ? `<h3 class="muted" style="margin-top:12px">آخر ما تصفحته</h3><ul class="bars">${recent.map((r) => `<li><span class="name">${r.type === "search" ? `<a href="#/search/${encodeURIComponent(r.key)}">بحث: ${esc(r.key)}</a>` : `<a href="#/h/${r.key}">${hkey(r.key)}</a>`}</span></li>`).join("")}</ul>` : ""}`;
  }

  // ---------- books ----------
  async function viewBooks() {
    const S = await stats();
    app.innerHTML = `<h1>الكتب التسعة</h1><p class="muted">أصول دواوين السنة، بأسانيدها ورواتها، من برنامج جامع خادم الحرمين الشريفين</p>
      <div class="kitabs books">${BOOKS.map((b) => `<a href="#/book/${b}"><span><b>${BOOK[b]}</b><br><span class="muted small">${NUMBERING[b]}</span></span>
        <span class="muted small">${fmt(S.totals.books[b].hadith)} حديثًا</span></a>`).join("")}</div>
      <p class="notice" style="margin-top:16px">أحاديث الصحيحين صحيحة بحكم الشيخين. وأحاديث السنن والمسانيد والموطأ فيها الصحيح والحسن والضعيف، فراجع أحكام المحدثين في صفحة كل حديث.</p>`;
  }

  async function viewBook(book) {
    const B = META.books[book];
    app.innerHTML = `<h1>${B.title}</h1><p class="muted">${fmt(B.kitabs.length)} كتابًا · ${fmt(B.kitabs.reduce((a, k) => a + k.count, 0))} حديثًا</p>
      <div class="kitabs">${B.kitabs.map((k) => `<a href="#/book/${book}/${k.no}"><span>${esc(k.title)}</span><span class="muted small">${fmt(k.count)}</span></a>`).join("")}</div>`;
  }

  async function viewKitab(book, no, page = "1") {
    const idx = await searchIndex([book]);
    no = +no; page = +page;
    const kitab = META.books[book].kitabs.find((k) => k.no === no);
    const prefix = PREFIX[book];
    const keys = Object.entries(META.index).filter(([k, v]) => k[0] === prefix && v[0] === no).map(([k]) => k)
      .sort((a, b) => +a.slice(1) - +b.slice(1));
    const textOf = new Map(idx.map((r) => [r[0], r]));
    const pages = Math.ceil(keys.length / PAGE);
    const slice = keys.slice((page - 1) * PAGE, page * PAGE);
    let lastBab = null;
    app.innerHTML = `<div class="crumbs"><a href="#/book/${book}">${BOOK[book]}</a> ‹ ${esc(kitab?.title || "")}</div>
      <h1>${esc(kitab?.title || "")}</h1><p class="muted">${fmt(keys.length)} حديثًا</p>
      <div class="panel"><ul class="list">${slice.map((k) => {
        const r = textOf.get(k);
        const bab = r && r[3] && r[3] !== lastBab ? `<h3 class="bab">${esc(r[3])}</h3>` : "";
        lastBab = r ? r[3] : lastBab;
        return `<li>${bab}<div class="meta-line"><a href="#/h/${k}">${hkey(k)}</a></div><a href="#/h/${k}" class="snip" style="color:inherit">${esc(clip(r ? r[2] : "", 220))}</a></li>`;
      }).join("")}</ul></div>
      ${pager(pages, page, (p) => `#/book/${book}/${no}/${p}`)}`;
  }

  function pager(pages, page, href) {
    if (pages <= 1) return "";
    const items = [];
    for (let p = Math.max(1, page - 3); p <= Math.min(pages, page + 3); p++) {
      items.push(p === page ? `<span class="btn on">${p}</span>` : `<a class="btn" href="${href(p)}">${p}</a>`);
    }
    return `<div class="pager">${page > 1 ? `<a class="btn" href="${href(page - 1)}">السابق</a>` : ""}${items.join("")}${page < pages ? `<a class="btn" href="${href(page + 1)}">التالي</a>` : ""}</div>`;
  }

  // ---------- hadith page ----------
  function partHTML(p, nar) {
    // narrator mentions become links; the matn span is set apart from the isnad
    const t = p.text;
    const cuts = p.mentions.map(([s, e, id]) => ({ s, e, id })).sort((a, b) => a.s - b.s);
    const [ms, me] = p.matn || [null, null];
    const emit = (from, to) => {
      let seg = "";
      for (let i = from; i < to; i++) {
        if (i === ms) seg += '<span class="matn">';
        seg += esc(t[i]);
        if (i === me - 1) seg += "</span>";
      }
      return seg;
    };
    let out = "", pos = 0;
    for (const c of cuts) {
      if (c.s < pos || c.e > t.length) continue;
      out += emit(pos, c.s);
      const n = nar[c.id];
      const label = esc(t.slice(c.s, c.e));
      out += n ? `<a class="nm cls-${n.cls}" href="#/n/${encodeURIComponent(c.id)}" title="${esc(n.name + (n.rank ? " — " + n.rank : ""))}">${label}</a>` : label;
      pos = c.e;
    }
    return out + emit(pos, t.length);
  }
  // the program's notes on the printed editions (in Musnad Ahmad: how the Risala edition differs)
  const notesHTML = (p) => (p.notes ? `<ul class="edition-notes" title="من تعليقات البرنامج على الطبعات">${p.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : "");
  const hadithTextHTML = (h, nar) => h.parts.map((p) => `<p>${partHTML(p, nar)}</p>${notesHTML(p)}`).join("");
  const matnOf = (h) => { const p = h.parts[0]; return p.matn ? p.text.slice(p.matn[0], p.matn[1]) : p.text; };

  // Scholars' verdicts in their own words, each with its source and a link to its page in al-Shamela
  function gradesHTML(h) {
    if (!h.grades || !h.grades.length) return "";
    const src = META.grade_sources || {};
    return `<div class="panel grades"><h3>أحكام المحدثين على هذا الحديث</h3>
      <div class="verdicts">${h.grades.map(([s, v, page, num]) => {
        const [by, work, book] = src[`${s}:${h.book}`] || [s, "", 0];
        const shamela = book ? `https://shamela.ws/book/${book}/${page}` : "";
        // a ready message naming the hadith and the verdict, so a reader can flag a wrong one
        const report = mailto(`نور السنة: ملاحظة على حكم في ${hkey(h.k)}`,
          `الحديث: ${hkey(h.k)}${num ? ` (الحديث ${num})` : ""}\n${location.href}\n\nالحكم المعروض: ${by}: ${v}\nالمصدر: ${work}${shamela ? `\n${shamela}` : ""}\n\nما الخطأ؟ (مثلًا: الحكم مختلف في المطبوع، أو هو حكم حديث آخر)\n`);
        return `<blockquote><cite>${esc(by)}${num ? ` · الحديث ${esc(num)}` : ""}</cite>${esc(v)}
          <span class="grade-src">${esc(work)}${shamela ? ` · <a href="${shamela}" target="_blank" rel="noopener">المكتبة الشاملة ↗</a>` : ""} · <a href="${report}">أبلغ عن خطأ في هذا الحكم</a></span></blockquote>`;
      }).join("")}</div>
      <p class="muted small">تُنقل الأحكام بنصها منسوبةً إلى أصحابها، وهي اجتهاد منهم. وقد يكون الحكم على الإسناد خاصة («إسناده ضعيف») والحديث ثابت من طريق أخرى.${
        h.grades.some(([s, v]) => s.startsWith("albani") && /(^|\s)[خمق](\s|،|$)/.test(v)) ? " ورموز الألباني: خ البخاري، م مسلم، ق متفق عليه." : ""}</p></div>`;
  }

  // The Dorar API cannot be embedded (served as text/html with nosniff and no CORS), so we link
  // to its hadith encyclopedia search for the opening words of the matn.
  function dorarURL(h) {
    const words = matnOf(h).replace(/[\u064B-\u0652\u0670\u0640]/g, "").replace(/[^\u0621-\u064A\s]/g, " ")
      .split(/\s+/).filter(Boolean).slice(0, 7).join(" ");
    return `https://dorar.net/hadith/search?q=${encodeURIComponent(words)}&st=w`;
  }

  // ---------- copy buttons ----------
  const COPY_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  const copyBtnHTML = (title) => `<button type="button" class="copy-btn" title="${title}" aria-label="${title}">${COPY_ICON}</button>`;
  // copies text(); the button shows a check for a moment
  function wireCopy(btn, text) {
    if (!btn) return;
    btn.addEventListener("click", async (e) => {
      e.preventDefault(); e.stopPropagation();  // inside a <summary>, do not fold or unfold
      const title = btn.title;
      try { await navigator.clipboard.writeText(text()); btn.title = "نُسخ ✓"; btn.classList.add("done"); }
      catch (_) { btn.title = "تعذّر النسخ"; }
      btn.innerHTML = btn.classList.contains("done") ? "✓" : COPY_ICON;
      setTimeout(() => { btn.title = title; btn.classList.remove("done"); btn.innerHTML = COPY_ICON; }, 1800);
    });
  }

  // ---------- the hadith as a shareable image: text, scholars' verdicts, simplified explanation ----------
  const SHOT_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
  const SHARE_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/></svg>';
  // words of text in lines no wider than width (in the canvas's current font)
  function wrapLines(g, text, width) {
    const lines = [];
    for (const para of String(text).split(/\n+/)) {
      let line = "";
      for (const w of para.split(/\s+/).filter(Boolean)) {
        const joined = line ? line + " " + w : w;
        if (line && g.measureText(joined).width > width) { lines.push(line); line = w; } else line = joined;
      }
      if (line) lines.push(line);
    }
    return lines;
  }
  // a companion's name to its first few words, never ending on "بن" or "أبي"
  function companionName(name) {
    const w = String(name || "").replace(/[\u200e\u200f]/g, "").trim().split(/\s+/).slice(0, 5);
    while (w.length > 1 && /^(بن|ابن|بنت|أبي|أبو|أم)$/.test(w[w.length - 1])) w.pop();
    return w.join(" ");
  }
  async function hadithCardPNG(h, nar) {
    const W = 1080, pad = 64, inner = W - 2 * pad, ui = (w, px) => `${w} ${px}px Tajawal, -apple-system, sans-serif`;
    const amiri = (w, px) => `${w} ${px}px Amiri, "Traditional Arabic", serif`;
    await Promise.all([document.fonts.load(amiri(400, 30)), document.fonts.load(amiri(700, 30)), document.fonts.load(ui(700, 24))]).catch(() => {});
    const cv = document.createElement("canvas"), g = cv.getContext("2d");
    const ops = [];  // drawn after the height is known
    let y = 150;
    const block = (font, color, text, lineH, { dir = "rtl", max = 0, gapAfter = 0 } = {}) => {
      g.font = font; g.direction = dir;
      let lines = wrapLines(g, text, inner);
      if (max && lines.length > max) { lines = lines.slice(0, max); lines[max - 1] += " …"; }
      for (const l of lines) { ops.push({ font, color, text: l, y: y + lineH / 2, dir }); y += lineH; }
      y += gapAfter;
    };
    const rule = () => { ops.push({ rule: true, y: y }); y += 34; };
    const heading = (text) => { block(ui(700, 26), "--gold", text, 40, { gapAfter: 6 }); };

    // the hadith: the Prophet's words (the matn) with the companion who reports it
    const matn = h.parts.map((p) => (p.matn ? p.text.slice(p.matn[0], p.matn[1]) : p.text).trim()).join("\n");
    const companion = h.chains.map((c) => nar[c.ids[0]]).find((n) => n && n.cls === "sahabi");
    if (companion) block(ui(500, 24), "--muted", "راوي الحديث: " + companionName(companion.name), 38, { gapAfter: 4 });
    block(amiri(700, 36), "--ink", matn, 64, { max: 16, gapAfter: 12 });

    // its verdict: the Sahihayn, al-Tirmidhi's own words, and the scholars' grades as the page shows them
    const verdicts = [];
    if (SAHIHAYN.has(h.book)) verdicts.push(`${h.type === "مرفوع" ? "صحيح: " : ""}أخرجه ${h.book === "bukhari" ? "البخاري" : "مسلم"} في صحيحه`);
    for (const v of h.verdicts || []) verdicts.push("قال الترمذي: " + v);
    const src = META.grade_sources || {};
    for (const [s, v] of h.grades || []) verdicts.push(`${(src[`${s}:${h.book}`] || [s])[0]}: ${v}`);
    if (verdicts.length) {
      rule(); heading("الحكم");
      for (const v of verdicts.slice(0, 4)) block(ui(500, 26), "--ink", v, 42, { max: 4 });
      y += 8;
    }

    // the simplified explanation, in the language the reader chose
    if (META.sharh && h.sx && h.sx.length) {
      const lang = sharhLang(), id = h.sx[0];
      const row = META.sharh.langs.find(([c]) => c === lang);
      const e = (lang !== "ar" && row && (await sharhEntry(lang, id))) || (await sharhEntry("ar", id));
      if (e) {
        const tr = e !== null && lang !== "ar" && row && e.h, dir = tr && !row[3] ? "ltr" : "rtl";
        rule(); heading("الشرح الميسّر");
        block(dir === "ltr" ? ui(400, 25) : amiri(400, 29), "--ink", e.x, dir === "ltr" ? 40 : 50, { dir, max: 14, gapAfter: 6 });
        block(ui(400, 20), "--muted", `من ${SHARH_BY}`, 32);
      }
    }
    y += 24;
    // footer: the site, the hadith's link and the project's notice
    const footTop = y;
    g.font = ui(400, 19); g.direction = "rtl";
    const note = wrapLines(g, NOTICE.split(" · ").slice(1).join(" · "), inner);
    cv.width = W; cv.height = footTop + 96 + note.length * 30 + 28;

    const bg = getComputedStyle(document.body).backgroundColor;
    g.fillStyle = bg; g.fillRect(0, 0, cv.width, cv.height);
    // header: the site's mark and name, the hadith's reference
    const icon = new Image(); icon.src = "icons/icon-192.png";
    await icon.decode().catch(() => {});
    if (icon.complete && icon.naturalWidth) g.drawImage(icon, W - pad - 64, 40, 64, 64);
    g.textBaseline = "middle"; g.direction = "rtl"; g.textAlign = "right";
    g.font = ui(700, 34); g.fillStyle = css("--gold"); g.fillText("نور السنة", W - pad - 80, 72);
    g.direction = "rtl"; g.textAlign = "left"; g.font = ui(700, 28); g.fillStyle = css("--ink");
    g.fillText(`${BOOK[h.book]} · ${h.aliases.length ? "الأحاديث" : "حديث"} ${h.label}`, pad, 72);
    g.fillStyle = css("--line"); g.fillRect(pad, 124, inner, 2);
    for (const o of ops) {
      if (o.rule) { g.fillStyle = css("--line"); g.fillRect(pad + inner / 3, o.y + 6, inner / 3, 1); continue; }
      g.font = o.font; g.fillStyle = css(o.color); g.direction = o.dir; g.textAlign = o.dir === "rtl" ? "right" : "left";
      g.fillText(o.text, o.dir === "rtl" ? W - pad : pad, o.y);
    }
    g.fillStyle = css("--panel-2") || bg; g.fillRect(0, footTop, W, cv.height - footTop);
    g.fillStyle = css("--gold"); g.fillRect(0, footTop, W, 3);
    g.direction = "rtl"; g.textAlign = "right"; g.font = ui(700, 26); g.fillStyle = css("--gold");
    g.fillText("نور السنة", W - pad, footTop + 48);
    const nameW = g.measureText("نور السنة").width;
    g.font = ui(500, 21); g.fillStyle = css("--ink"); g.fillText("· مشروع وقفي لخدمة السنة النبوية", W - pad - nameW - 12, footTop + 49);
    g.direction = "ltr"; g.textAlign = "left"; g.font = ui(500, 22); g.fillStyle = css("--ink");
    g.fillText(location.host + location.pathname.replace(/[^/]*$/, ""), pad, footTop + 48);
    g.direction = "rtl"; g.textAlign = "center"; g.font = ui(400, 19); g.fillStyle = css("--muted");
    note.forEach((l, i) => g.fillText(l, W / 2, footTop + 96 + i * 30));
    return new Promise((ok) => cv.toBlob(ok, "image/png"));
  }
  // save the card, or share it with the link (on phones: the share sheet, e.g. WhatsApp)
  function wireCard(box, h, nar) {
    const name = `${BOOK[h.book]} ${h.label}`;
    box.addEventListener("click", async (ev) => {
      const b = ev.target.closest("[data-card]");
      if (!b) return;
      const share = b.dataset.card === "share", title = b.title;
      const flash = (t) => { b.title = t; b.classList.add("done"); setTimeout(() => { b.title = title; b.classList.remove("done"); }, 1800); };
      const blob = await hadithCardPNG(h, nar), f = new File([blob], `نور السنة - ${name}.png`, { type: "image/png" });
      const data = { files: [f], title: "نور السنة: " + name, text: "نور السنة: " + name + "\n" + location.href };
      if (share && navigator.canShare && navigator.canShare(data)) {
        try { await navigator.share(data); } catch (_) { /* cancelled */ }
        return;
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = f.name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      if (!share) return flash("حُفظت الصورة ✓");
      try { await navigator.clipboard.writeText(location.href); flash("حُفظت الصورة ونُسخ الرابط ✓"); } catch (_) { flash("حُفظت الصورة"); }
    });
  }

  // ---------- the simplified explanation (موسوعة الأحاديث النبوية, hadeethenc.com) ----------
  const SHARH_BY = "موسوعة الأحاديث النبوية";
  const SHARH_ORG = "إعداد مركز الترجمة بالمكتب التعاوني للدعوة وتوعية الجاليات بالربوة";
  const sharhLang = () => { try { return localStorage.getItem("sharhLang") || "ar"; } catch { return "ar"; } };
  const sharhEntry = (lang, id) => getJSON(`data/sharh/${lang}/${id % META.sharh.buckets}.json`).then((b) => b[id]).catch(() => null);

  async function renderSharh(el, h) {
    if (!el || !META.sharh) return;
    // a hadith with no explanation of its own may have that of a similar one, shown as such
    const similar = !h.sx && !!h.sy, ids = h.sx || (h.sy ? [h.sy] : []);
    if (!ids.length) {
      el.innerHTML = `<p class="notice sharh-none">لا يوجد شرح ميسّر لهذا الحديث في ${SHARH_BY}. <a href="${dorarURL(h)}" target="_blank" rel="noopener">ابحث عن شرحه في الدرر السنية ↗</a></p>`;
      return;
    }
    const langs = META.sharh.langs;
    let open = false;
    const draw = async () => {
      let lang = sharhLang();
      if (!langs.some(([c]) => c === lang)) lang = "ar";
      const [ar, tr] = await Promise.all([Promise.all(ids.map((i) => sharhEntry("ar", i))),
        lang === "ar" ? null : Promise.all(ids.map((i) => sharhEntry(lang, i)))]);
      if (!el.isConnected) return;
      const [, native, , rtl] = langs.find(([c]) => c === lang);
      const picker = `<label class="sharh-lang">اقرأ الشرح بلغة أخرى <select>${langs.map(([c, name]) => `<option value="${c}"${c === lang ? " selected" : ""}>${esc(name)}</option>`).join("")}</select></label>`;
      const blocks = ids.map((id, n) => {
        const a = ar[n], t = tr && tr[n];
        if (!a && !t) return "";
        const page = `https://hadeethenc.com/${t ? lang : "ar"}/browse/hadith/${id}`;
        const missing = tr && !t ? `<p class="notice">لا تتوفر ترجمة هذا الشرح بـ${esc(native)} بعد، فيُعرض بالعربية.</p>` : "";
        const e = t || a;
        const dir = t ? (rtl ? "rtl" : "ltr") : "rtl";
        return `<article class="sharh-item">${missing}
          <div dir="${dir}" lang="${t ? lang : "ar"}" class="${t && !rtl ? "ltr" : ""}">
            ${ids.length > 1 ? `<h4>${esc(e.t)}</h4>` : ""}
            ${t && t.h || similar ? `<p class="sharh-hadith">${esc(e.h || "")}</p>` : ""}
            <p class="sharh-text">${esc(e.x)}</p>
            ${e.f && e.f.length ? `<details${ids.length > 1 ? "" : " open"}><summary>${t ? "Benefits · الفوائد" : "من فوائد الحديث"}</summary><ul>${e.f.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></details>` : ""}
            ${!t && a.w && a.w.length ? `<details><summary>معاني الكلمات</summary><dl class="sharh-words">${a.w.map(([w, m]) => `<dt>${esc(w)}</dt><dd>${esc(m)}</dd>`).join("")}</dl></details>` : ""}
          </div>
          ${n === ids.length - 1 ? picker : ""}
          <span class="grade-src">${SHARH_BY} · <a href="${page}" target="_blank" rel="noopener">الحديث في الموسوعة ↗</a> · <a href="${mailto(`نور السنة: ملاحظة على الشرح الميسر في ${hkey(h.k)}`,
            `الحديث: ${hkey(h.k)}\n${location.href}\n\nالشرح المعروض: ${e.t || ""}\n${page}\n\nما الخطأ؟ (مثلًا: الشرح لحديث آخر، أو خطأ في الترجمة)\n`)}">أبلغ عن خطأ في هذا الشرح</a></span></article>`;
      }).join("");
      // folded until the reader opens it; it stays open when the language changes
      el.innerHTML = `<details class="panel sharh"${open ? " open" : ""}>
        <summary class="sharh-head"><h3>${similar ? "شرح حديث مشابه" : "الشرح الميسّر"}</h3><span class="muted small">${similar
          ? "لا شرح لهذا الحديث بعينه، وهذا شرح حديث قريب منه في لفظه" : `شرح مختصر للحديث وفوائده، بالعربية و${fmt(langs.length - 1)} لغة`}</span>${copyBtnHTML("نسخ الشرح")}</summary>
        ${similar ? `<p class="notice">هذا نص الحديث المشروح في ${SHARH_BY}، وهو قريب من لفظ هذه الرواية وقد يختلفان في بعض المعنى، فقارن بين النصين.</p>` : ""}
        ${blocks}
        <p class="muted small">من ${SHARH_BY} (${SHARH_ORG})، شرح مختصر لعموم القرّاء، يُنقل بنصه. وقد يكون لفظ الحديث في الموسوعة مختلفًا يسيرًا عن لفظ هذه الرواية.</p></details>`;
      wireCopy(el.querySelector(".copy-btn"), () => [
        `${similar ? "شرح حديث مشابه" : "الشرح الميسّر"}: ${BOOK[h.book]} — حديث رقم ${h.label}`,
        ...ids.map((id, n) => {  // the page's link names the source, so only the text is copied
          const a = ar[n], t = tr && tr[n], e = t || a;
          if (!e) return "";
          return [(t || similar) && e.h, e.x, e.f && e.f.length ? (t ? "" : "من فوائد الحديث:\n") + e.f.map((x) => "- " + x).join("\n") : "",
            !t && a.w && a.w.length ? "معاني الكلمات:\n" + a.w.map(([w, m]) => `- ${w}: ${m}`).join("\n") : ""].filter(Boolean).join("\n\n");
        }),
        location.href].filter(Boolean).join("\n\n"));
      el.querySelector("details").addEventListener("toggle", (ev) => { open = ev.target.open; });
      el.querySelector("select").addEventListener("change", (ev) => {
        try { localStorage.setItem("sharhLang", ev.target.value); } catch {}
        draw();
      });
    };
    draw();
  }

  // previous/next hadith in the same book, by number (aliases fold into their main key)
  let bookKeys = {};
  const neighbors = (key) => {
    const prefix = key[0];
    const keys = bookKeys[prefix] ||= Object.keys(META.index).filter((k) => k[0] === prefix).sort((a, b) => +a.slice(1) - +b.slice(1));
    const i = keys.indexOf(key);
    return [keys[i - 1], keys[i + 1]];
  };
  document.addEventListener("keydown", (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
    const a = e.key === "ArrowRight" ? $(".hnav [data-dir=prev]") : e.key === "ArrowLeft" ? $(".hnav [data-dir=next]") : null;
    if (a && a.href) { e.preventDefault(); location.href = a.href; }
  });

  async function viewHadith(key) {
    if (!META.index[key] && META.alias[key]) { location.replace("#/h/" + META.alias[key]); return; }
    const entry = META.index[key];
    if (!entry) { app.innerHTML = missingHadithHTML(key); return; }
    const shard = await group(entry[1]);
    const h = shard.items[key];
    // the hadith with exactly the parallels the program's takhrij lists for it
    const G = {
      ...shard, hadiths: [key, ...h.rel.filter((k) => shard.items[k])],
      n_chains: h.set.n_chains, madar: h.set.madar, companions: h.set.companions, books: h.set.books, spread: h.spread,
    };
    const book = h.book;
    const kitab = META.books[book].kitabs.find((k) => k.no === h.kitab);
    track("view", key);

    const compilerOf = (k) => AUTHOR[bookOf(k)];
    const others = G.hadiths.filter((k) => k !== key);
    const companions = G.companions.map(([c]) => c).filter((c) => G.nar[c]?.cls === "sahabi");
    const ownCompanions = new Set(h.chains.map((c) => c.ids[0]));
    const madar = G.madar ? G.nar[G.madar] : null;
    const sp = G.spread;

    app.innerHTML = `
      <div class="crumbs"><a href="#/book/${book}">${BOOK[book]}</a> ‹ <a href="#/book/${book}/${h.kitab}">${esc(kitab?.title || "")}</a>${h.bab ? ` ‹ ${esc(h.bab)}` : ""}</div>
      <h1>${BOOK[book]} — ${h.aliases.length ? "الأحاديث" : "حديث رقم"} ${esc(h.label)}</h1>
      <div class="meta-line" style="margin-bottom:10px">${h.type ? `<span class="tag">${esc(h.type)}</span>` : ""}
        <span>${NUMBERING[book]}</span>${h.parts.length > 1 ? `<span>· ${fmt(h.parts.length)} روايات تحت هذا الرقم</span>` : ""}
        <nav class="hnav" aria-label="التنقل بين الأحاديث">${neighbors(key).map((k, i) => {
          const dir = i ? "next" : "prev", label = i ? "الحديث التالي" : "الحديث السابق", arrow = i ? "‹" : "›";
          return k ? `<a class="btn" data-dir="${dir}" href="#/h/${k}" title="${label}: ${hkey(k)} (${i ? "←" : "→"})" aria-label="${label}">${i ? `${esc(hnum(k))} ${arrow}` : `${arrow} ${esc(hnum(k))}`}</a>`
            : `<span class="btn" aria-disabled="true">${arrow}</span>`;
        }).join("")}</nav></div>
      <div class="panel hadith-text"><div class="text-tools">${copyBtnHTML("نسخ نص الحديث")}<button type="button" class="copy-btn" data-card="shot" title="حفظ صورة الحديث مع حكمه وشرحه" aria-label="حفظ صورة الحديث">${SHOT_ICON}</button><button type="button" class="copy-btn" data-card="share" title="مشاركة صورة الحديث والرابط" aria-label="مشاركة صورة الحديث">${SHARE_ICON}</button></div>${hadithTextHTML(h, G.nar)}</div>
      <div id="sharh"></div>
      ${SAHIHAYN.has(book) ? "" : `<p class="notice sunan-note">${book === "muwatta"
        ? "في موطأ مالك المسند والمرسل والبلاغ، ومعها آثار الصحابة والتابعين وأقوال مالك"
        : `أحاديث ${BOOK[book]} فيها الصحيح والحسن والضعيف`}، فراجع أحكام المحدثين قبل الاستدلال بهذا الحديث.</p>`}
      ${h.verdicts && h.verdicts.length ? `<div class="verdicts tirmidhi">${h.verdicts.map((v) => `<blockquote><cite>قال الترمذي</cite>${esc(v)}</blockquote>`).join("")}
        <p class="muted small">للترمذي اصطلاح خاص في التحسين يختلف عن اصطلاح المتأخرين، فيُنظر معه في أحكام المحدثين الآخرين.</p></div>` : ""}

      <div class="summary">
        <span class="pill">أسانيده هنا: <b>${fmt(h.chains.length)}</b></span>
        <span class="pill">مع رواياته في الكتب التسعة: <b>${fmt(G.n_chains)}</b> إسنادًا في <b>${fmt(G.hadiths.length)}</b> رواية</span>
        <span class="pill">الصحابة في الكتب التسعة: <b>${fmt(companions.length)}</b></span>
        ${madar ? `<span class="pill">المدار: <b><a href="#/n/${encodeURIComponent(G.madar)}">${esc(shortName(madar.name))}</a></b> · <a href="#/turuq?d=${encodeURIComponent(G.madar)}">أحاديث مداره</a></span>` : ""}
        ${sp && sp.n_hadith ? `<span class="pill">تخريجه في كتب السنة: <b>${fmt(sp.n_hadith)}</b> رواية في <b>${fmt(sp.n_books)}</b> كتابًا</span>` : ""}
        ${sp && sp.shawahid.length ? `<span class="pill">له شواهد عن: <b>${fmt(sp.shawahid.length)}</b> صحابيًا</span>` : ""}
      </div>

      ${gradesHTML(h)}
      <div class="panel dorar">
        <div><h3>${h.grades && h.grades.length ? "أحكام أخرى في الدرر السنية" : "أحكام المحدثين على هذا الحديث"}</h3>
          <p class="muted small">من الموسوعة الحديثية في موقع الدرر السنية: نتائج البحث عن طرف الحديث، وقد تشمل رواياتٍ أخرى مشابهة.</p></div>
        <a class="btn on" href="${dorarURL(h)}" target="_blank" rel="noopener">اعرض الأحكام في الدرر السنية ↗</a>
      </div>

      <div class="hadith-layout">
        <div class="tree-wrap">
          <div class="tree-tools">
            <div class="seg" id="scope">
              <button data-v="one" class="${others.length ? "" : "on"}">هذه الرواية</button>
              ${others.length ? `<button data-v="all" class="on">كل طرقه في الكتب التسعة (${fmt(G.n_chains)})</button>` : ""}
            </div>
            ${G.books.length > 1 ? `<div class="seg" id="bookf"><button data-v="" class="on">الكل</button>${BOOKS.filter((b) => G.books.includes(b)).map((b) => `<button data-v="${PREFIX[b]}">${AUTHOR[b]}</button>`).join("")}</div>` : ""}
            <button class="btn" id="fit">ملاءمة العرض</button>
            <a class="btn" href="${mailto(`نور السنة: ملاحظة على ${hkey(key)}`)}">أبلغ عن خطأ</a>
          </div>
          ${graphBox('<div id="tree" role="img" aria-label="شجرة الرواة"></div>')}
          <div class="legend" id="rankf"><span class="cls-nabi"><i style="background:var(--c)"></i>${CLS_LABEL.nabi}</span>${["sahabi", "thiqa", "saduq", "maqbul", "weak"].map((c) => `<button class="cls-${c}" data-c="${c}" title="تمييز رواة هذه الرتبة والطرق التي تمر بهم"><i style="background:var(--c)"></i>${CLS_LABEL[c]}</button>`).join("")}<span class="cls-imam"><i style="background:var(--c)"></i>${CLS_LABEL.imam}</span>${madar ? `<button data-c="madar" style="--c:var(--gold)" title="تمييز المدار والطرق التي تمر به"><i style="background:transparent;border:2px solid var(--gold)"></i>المدار</button>` : ""}<span class="muted">سُمك الخط = عدد الطرق · اضغط على رتبة لتمييزها</span></div>
        </div>
        <aside class="panel side" id="side"><p class="empty">اضغط على أي راوٍ في الشجرة لعرض ترجمته المختصرة وتمييز الطرق التي تمر به.</p></aside>
      </div>

      <div class="section-title"><h2>أسانيده</h2><p>وصف رجال كل إسناد بحسب رتبهم عند ابن حجر، وليس حكمًا على الحديث</p></div>
      <div class="panel"><p class="notice" id="chainf" hidden></p><ul class="list" id="chains">${h.chains.map((c) => chainRow(c, G.nar, compilerOf(key))).join("") || '<li class="muted">لا يوجد إسناد مستخرج لهذه الرواية.</li>'}</ul></div>

      ${others.length ? `<div class="section-title"><h2>رواياته الأخرى في الكتب التسعة</h2><p>كما في تخريج البرنامج · «متابعة»: عن الصحابي نفسه · «شاهد»: عن صحابي آخر</p></div>
      <div class="panel"><ul class="list">${others.map((k) => {
        const o = G.items[k];
        const shahid = !o.chains.some((c) => ownCompanions.has(c.ids[0]));
        return `<li><div class="meta-line"><a href="#/h/${k}">${hkey(k)}</a><span class="tag">${shahid ? "شاهد" : "متابعة"}</span>${o.bab ? `<span>${esc(o.bab)}</span>` : ""}</div>
          <div class="snip">${esc(clip(matnOf(o), 260))}</div>
          ${o.chains.slice(0, 3).map((c) => chainHTML(c.ids, G.nar, c.z ? null : compilerOf(k))).join("")}${o.chains.length > 3 ? `<p class="muted small">و${fmt(o.chains.length - 3)} أسانيد أخرى</p>` : ""}</li>`;
      }).join("")}</ul></div>` : ""}

      ${sp && sp.books.length ? `<div class="section-title"><h2>تخريجه في كتب السنة</h2><p>عدد رواياته في كل كتاب بحسب تخريج برنامج جامع خادم الحرمين الشريفين</p></div>
      <div class="panel"><div class="chain">${sp.books.map(([b, n]) => `<span class="chip">${esc(b)}<span class="muted small" style="margin-inline-start:6px">${fmt(n)}</span></span>`).join(" ")}${sp.n_books > sp.books.length ? `<span class="muted small">و${fmt(sp.n_books - sp.books.length)} كتابًا آخر</span>` : ""}</div>
        ${sp.shawahid.length ? `<h3 style="margin-top:14px">شواهده عن صحابة آخرين</h3><div class="chain">${sp.shawahid.map((n) => `<span class="chip cls-sahabi"><span class="dot"></span>${esc(n)}</span>`).join(" ")}</div>` : ""}</div>` : ""}`;

    wireCard($(".hadith-text .text-tools"), h, G.nar);
    wireCopy($('.hadith-text .copy-btn:not([data-card])'), () => `${BOOK[book]} — ${h.aliases.length ? "الأحاديث" : "حديث رقم"} ${h.label}\n\n${h.parts.map((p) => p.text.trim()).join("\n\n")}\n\n${location.href}`);
    renderSharh($("#sharh"), h);
    let scope = others.length ? "all" : "one", bookFilter = "", rank = "";
    // default side panel: the narrators of the drawn tree, grouped by Ibn Hajar's tabaqat
    const tabaqat = () => {
      const by = new Map();
      cy.nodes().forEach((n) => {
        const id = n.id(), info = G.nar[id];
        if (SPECIAL.has(id) || !info) return;
        const t = info.tabaka || 0;
        if (!by.has(t)) by.set(t, []);
        by.get(t).push(n);
      });
      return by;
    };
    const tabaqaName = (t) => (t ? `${fmt(t)} · ${TABAQA_NAMES[t]}` : "غير محددة الطبقة");
    // the same list, for the saved image of the tree
    const tabaqatSide = () => {
      const by = tabaqat();
      return { title: "طبقات الرواة", text: { title: "نص الحديث" + (h.bab ? " · " + h.bab : ""), body: matnOf(h).trim() }, groups: [...by.keys()].sort((a, b) => (a || 99) - (b || 99)).map((t) => ({ name: tabaqaName(t),
        items: by.get(t).sort((a, b) => b.data("n") - a.data("n")).map((n) => ({ label: n.data("label"), cls: n.data("cls"), madar: n.id() === G.madar })) })) };
    };
    const overview = () => {
      const by = tabaqat();
      const total = [...by.values()].reduce((a, l) => a + l.length, 0);
      return `<h3>طبقات الرواة</h3>
        <p class="muted small">${fmt(total)} راويًا مرتبين بحسب طبقات ابن حجر · اضغط على أي راوٍ هنا أو في الشجرة لعرض ترجمته وتمييز الطرق التي تمر به.</p>
        ${[...by.keys()].sort((a, b) => (a || 99) - (b || 99)).map((t) => `<div class="tabaqa"><h4><span>${tabaqaName(t)}</span><span class="muted">${fmt(by.get(t).length)}</span></h4>
          <div class="chain">${by.get(t).sort((a, b) => b.data("n") - a.data("n")).map((n) => `<button class="chip cls-${n.data("cls")}${n.id() === G.madar ? " madar" : ""}" data-id="${esc(n.id())}" title="${fmt(n.data("n"))} طريقًا"><span class="dot"></span>${esc(n.data("label"))}</button>`).join("")}</div></div>`).join("")}`;
    };
    $("#side").addEventListener("click", (e) => {
      if (e.target.closest("[data-back]")) { cy.elements().removeClass("dim hl"); applyRank(""); return; }
      const b = e.target.closest("button[data-id]");
      const node = b && cy && cy.getElementById(b.dataset.id);
      if (!node || !node.length) return;
      node.emit("tap");
      cy.animate({ center: { eles: node } }, { duration: 300 });
    });
    const inRank = (id, c) => (c === "madar" ? id === G.madar : (G.nar[id] || {}).cls === c);
    // highlight the narrators of one rank (or the madar) and the routes through them; filter the chain list to match
    const applyRank = (c) => {
      rank = c;
      $("#rankf").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.c === c));
      const rows = [...$("#chains").children].filter((li) => li.dataset.ids !== undefined);
      rows.forEach((li) => { li.hidden = !!c && !li.dataset.ids.split(" ").some((id) => inRank(id, c)); });
      const shown = rows.filter((li) => !li.hidden).length;
      const note = $("#chainf");
      note.hidden = !c;
      const what = c === "madar" ? "المدار" : CLS_LABEL[c];
      if (c) note.textContent = shown ? `${fmt(shown)} من ${fmt(rows.length)} أسانيد هذه الرواية فيها: ${what}` : `ليس في أسانيد هذه الرواية: ${what}، وإنما في طرقها الأخرى المبيّنة في الشجرة.`;
      if (!cy) return;
      cy.elements().removeClass("dim hl pick");
      if (!c) { $("#side").innerHTML = overview(); return; }
      const hit = cy.nodes().filter((n) => inRank(n.id(), c));
      const path = hit.union(hit.predecessors()).union(hit.successors());
      cy.elements().not(path).addClass("dim");
      path.edges().addClass("hl");
      hit.addClass("pick");
      $("#side").innerHTML = `<h3 class="cls-${c}"><span class="dot"${c === "madar" ? ' style="background:var(--gold)"' : ""}></span>${what} في هذه الشجرة: ${fmt(hit.length)}</h3>
        <div class="chain">${hit.sort((a, b) => b.data("n") - a.data("n")).map((n) => `<a class="chip cls-${n.data("cls")}" href="#/n/${encodeURIComponent(n.id())}"><span class="dot"></span>${esc(n.data("label"))}<span class="muted small" style="margin-inline-start:6px">${fmt(n.data("n"))}</span></a>`).join(" ")}</div>
        <p class="muted small">العدد بجانب الاسم = عدد الطرق التي تمر به في الشجرة.</p>`;
    };
    // disable ranks absent from the current tree, keep the chosen one applied across redraws
    const draw = () => {
      drawTree(G, scope === "one" ? [key] : G.hadiths.filter((k) => !bookFilter || k[0] === bookFilter), key);
      $("#rankf").querySelectorAll("button").forEach((b) => { b.disabled = !cy.nodes().some((n) => inRank(n.id(), b.dataset.c)); });
      cy.on("tap", (e) => { if (e.target === cy) applyRank(""); });
      // tapping a narrator switches to its own routes (selectNode); just drop the rank filter
      cy.on("tap", "node", () => {
        if (!rank) return;
        rank = "";
        $("#rankf").querySelectorAll("button").forEach((b) => b.classList.remove("on"));
        [...$("#chains").children].forEach((li) => { li.hidden = false; });
        $("#chainf").hidden = true;
        cy.elements().removeClass("pick");
      });
      applyRank(rank && !$(`#rankf button[data-c="${rank}"]`).disabled ? rank : "");
    };
    $("#rankf").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b || b.disabled) return; applyRank(rank === b.dataset.c ? "" : b.dataset.c); });
    draw();
    $("#scope")?.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; scope = b.dataset.v; setSeg("#scope", b); draw(); });
    $("#bookf")?.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; bookFilter = b.dataset.v; setSeg("#bookf", b); draw(); });
    $("#fit").addEventListener("click", () => cy && cy.fit(undefined, 16));
    graphTools($("#tree"), () => cy, () => readable(cy, "nabi"), "شجرة إسناد " + hkey(key), `isnad-${key}`, tabaqatSide);
  }

  // A valid number the current data export lacks: send the reader to the official program.
  function missingHadithHTML(key) {
    const prefix = key[0], num = +key.slice(1);
    if (!LAST_NUMBER[prefix] || !(num >= 1 && num <= LAST_NUMBER[prefix])) {
      return `<div class="panel">الحديث غير موجود. تأكد من الرقم: ${BOOKS.map((b) => `${BOOK[b]} من 1 إلى ${fmt(LAST_NUMBER[PREFIX[b]])}`).join("، ")}.</div>`;
    }
    const book = BOOK[BOOK_OF[prefix]];
    const numbering = NUMBERING[BOOK_OF[prefix]];
    const nearby = [num - 1, num + 1].map((n) => `${prefix}${n}`).filter((k) => META.index[k] || META.alias[k]);
    return `<div class="panel missing">
      <h1>${book} — حديث رقم ${fmt(num)}</h1>
      <p class="notice">هذا الحديث غير متوفر في النسخة الحالية من البيانات، ونعمل على استكماله.</p>
      <p>يمكنك قراءته في الموقع الرسمي لبرنامج جامع خادم الحرمين الشريفين للسنة النبوية، بالبحث عن: <b>${book}، حديث رقم ${fmt(num)}</b> (${numbering}).</p>
      <p><a class="btn on" href="https://sunna.alifta.gov.sa/" target="_blank" rel="noopener">افتح الموقع الرسمي للبرنامج</a></p>
      ${nearby.length ? `<p class="muted small">الأحاديث المجاورة: ${nearby.map((k) => `<a href="#/h/${k}">${hkey(k)}</a>`).join(" · ")}</p>` : ""}
    </div>`;
  }

  function chainRow(c, nar, compiler) {
    const [label, cls] = CHAIN_LABEL[c.c] || ["", ""];
    const tags = [];
    if (label) tags.push(`<span class="tag ${cls}">${label}</span>`);
    tags.push(`<span class="tag">${c.ids.length} رواة</span>`);
    if (c.z) { tags.push(`<span class="tag">${ZAWAID}</span>`); compiler = null; }
    if (c.t) tags.push(`<span class="tag ok">${c.t === 2 ? "ثنائي" : "ثلاثي"}</span>`);
    return `<li data-ids="${esc(c.ids.join(" "))}"><div class="meta-line">${tags.join("")}</div>${chainHTML(c.ids, nar, compiler)}</li>`;
  }

  // ---------- tree ----------
  let cy = null;
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

  // soft S-shaped edges like the home page tree: each edge leaves and enters its nodes horizontally.
  // Two control points (mid-x, source-y) and (mid-x, target-y), expressed relative to the source→target line.
  const CURVE = { "curve-style": "unbundled-bezier", "edge-distances": "node-position", "control-point-distances": "0 0", "control-point-weights": "0.25 0.75" };
  function curve(e) {
    const s = e.source().position(), t = e.target().position();
    const dx = t.x - s.x, dy = t.y - s.y, L2 = dx * dx + dy * dy;
    if (L2 < 1 || Math.abs(dy) < 1) return e.style("curve-style", "straight");
    const w = Math.min(Math.max((dx * dx) / (2 * L2), 0.02), 0.48), d = -(dx * dy) / (2 * Math.sqrt(L2));
    e.style({ "curve-style": "unbundled-bezier", "control-point-distances": `${d} ${-d}`, "control-point-weights": `${w} ${1 - w}` });
  }
  function curves(c) {
    const all = () => c.edges().forEach(curve);
    c.on("layoutstop", all);
    c.on("position", "node", (ev) => ev.target.connectedEdges().forEach(curve));
    all();
  }

  function drawTree(G, keys, focusKey) {
    const nar = G.nar;
    const nodes = new Map(), edges = new Map(), focusEdges = new Set();
    const addNode = (id) => nodes.set(id, (nodes.get(id) || 0) + 1);
    for (const k of keys) {
      for (const c of G.items[k].chains) {
        const full = ["nabi", ...c.ids, ...endOf(k, c)];
        full.forEach(addNode);
        for (let i = 0; i < full.length - 1; i++) {
          const id = full[i] + ">" + full[i + 1];
          edges.set(id, (edges.get(id) || 0) + 1);
          if (k === focusKey) focusEdges.add(id);
        }
      }
    }
    const els = [];
    for (const [id, n] of nodes) {
      const info = nar[id] || { name: id, cls: "unknown" };
      els.push({ data: { id, label: shortName(info.name), cls: info.cls, n, madar: id === G.madar ? 1 : 0 } });
    }
    for (const [id, w] of edges) {
      const [s, t] = id.split(">");
      els.push({ data: { id, source: s, target: t, w, focus: focusEdges.has(id) && keys.length > 1 ? 1 : 0 } });
    }
    const color = (c) => css(`--c-${c}`) || css("--c-unknown");
    // height follows the widest rank of the tree so names stay legible
    const perRank = new Map();
    for (const k of keys) for (const c of G.items[k].chains) c.ids.forEach((id, i) => {
      if (!perRank.has(i)) perRank.set(i, new Set());
      perRank.get(i).add(id);
    });
    const widest = Math.max(1, ...[...perRank.values()].map((s) => s.size));
    $("#tree").style.height = Math.min(Math.max(widest * 38 + 60, 360), 1100) + "px";
    if (cy) cy.destroy();
    cy = cytoscape({
      container: $("#tree"),
      elements: els,
      wheelSensitivity: 0.25,
      minZoom: 0.1,
      maxZoom: 2.5,
      layout: { name: "dagre", rankDir: "RL", nodeSep: 8, rankSep: 36, edgeSep: 4, padding: 16 },
      style: [
        { selector: "node", style: {
          "shape": "round-rectangle", "width": "label", "height": "label", "padding": "7px",
          "background-color": css("--panel"), "border-width": 2, "border-color": (e) => color(e.data("cls")),
          "label": "data(label)", "color": css("--ink"), "font-family": "-apple-system, BlinkMacSystemFont, Tajawal, sans-serif",
          "font-size": 12, "text-valign": "center", "text-halign": "center", "text-wrap": "wrap", "text-max-width": 120,
        } },
        { selector: "node[cls = 'nabi']", style: { "background-color": color("nabi"), "color": "#fff", "font-size": 14, "font-weight": 700 } },
        { selector: "node[cls = 'imam']", style: { "background-color": color("imam"), "color": "#fff", "font-weight": 700 } },
        { selector: "node[cls = 'taliq'], node[cls = 'mubham']", style: { "border-style": "dashed", "color": css("--muted") } },
        { selector: "node[madar = 1]", style: { "border-width": 5, "border-color": css("--gold"), "border-style": "double" } },
        { selector: "edge", style: {
          "width": (e) => Math.min(1.4 + Math.log2(e.data("w")) * 1.4, 7), "line-color": css("--gold"), "line-opacity": 0.55,
          "target-arrow-shape": "triangle", "target-arrow-color": css("--gold"), "arrow-scale": 0.7, ...CURVE,
        } },
        { selector: "edge[focus = 1]", style: { "line-color": css("--accent"), "target-arrow-color": css("--accent"), "line-opacity": 1, "z-index": 5 } },
        { selector: ".dim", style: { "opacity": 0.15 } },
        { selector: "edge.hl", style: { "line-color": css("--gold"), "target-arrow-color": css("--gold"), "line-opacity": 1, "z-index": 9 } },
        { selector: "node.pick", style: { "border-width": 4, "font-weight": 700 } },
      ],
    });
    curves(cy);
    readable(cy, "nabi");
    cy.on("tap", "node", (e) => selectNode(e.target, G));
    cy.on("tap", (e) => { if (e.target === cy) cy.elements().removeClass("dim hl"); });
  }

  // zoom buttons + a hint over a graph; the mouse wheel scrolls the page unless Ctrl/⌘ is held (pinch sends ctrlKey)
  const graphBox = (inner) => `<div class="graph-box">${inner}
    <div class="graph-ctl"><button data-z="in" title="تكبير" aria-label="تكبير">+</button><button data-z="out" title="تصغير" aria-label="تصغير">−</button><button data-z="reset" title="العودة إلى الشكل الأصلي" aria-label="العودة إلى الشكل الأصلي">⟲</button><button data-z="full" title="ملء الشاشة" aria-label="ملء الشاشة">⛶</button><button data-z="shot" title="لقطة: حفظ صورة الشجرة" aria-label="حفظ صورة الشجرة"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg></button><button data-z="share" title="مشاركة الصورة والرابط" aria-label="مشاركة"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/></svg></button></div>
    <p class="graph-hint">تفاعلي: اسحب للتحريك، وكبّر بالأزرار أو بالعجلة مع <bdi>Ctrl</bdi>، و⟲ يعيد الشكل الأصلي</p></div>`;
  const NOTICE = "مشروع وقفي مفتوح لخدمة السنة النبوية · البيانات من مصادر مفتوحة (انظر عن المشروع) · الأحكام المعروضة منقولة عن أهل العلم والأداة مساعِدة للباحث لا تُغني عن النظر.";
  // the whole graph as a PNG blob, with a caption bar (site name + what it shows) under it
  // side: optional { title, groups: [{ name, items: [{ label, cls }] }], text: { title, body } }: the groups as a column
  // left of the graph, the text (the hadith's matn) in the space under it
  async function graphPNG(c, caption, side) {
    const bg = getComputedStyle(document.body).backgroundColor;
    const img = new Image();
    img.src = c.png({ full: true, scale: 2, bg, maxWidth: 6000, maxHeight: 6000 });
    await img.decode();
    const bar = 64, cv = document.createElement("canvas"), g = cv.getContext("2d");
    const font = (w, px) => `${w} ${px}px Tajawal, -apple-system, sans-serif`;
    // lay out the side column first (chips wrap right-to-left) to know its height
    const colW = side ? 560 : 0, pad = 28, chipH = 40, gap = 10, ops = [];
    let y = pad;
    if (side) {
      g.direction = "rtl";
      ops.push({ t: "h", y: y + 18, text: side.title }); y += 56;
      for (const grp of side.groups) {
        ops.push({ t: "g", y: y + 14, text: grp.name, n: grp.items.length }); y += 40;
        g.font = font(400, 20);
        let x = colW - pad;
        for (const it of grp.items) {
          const w = Math.min(g.measureText(it.label).width + 52, colW - 2 * pad);
          if (x - w < pad) { x = colW - pad; y += chipH + gap; }
          ops.push({ t: "c", x: x - w, y, w, it }); x -= w + gap;
        }
        y += chipH + 26;
      }
    }
    cv.width = Math.max(img.width + colW, 900);
    // the matn, word-wrapped to the graph's width, capped so a long hadith does not dwarf the tree
    const text = side && side.text, lines = [], lineH = 46, areaW = cv.width - colW;
    if (text) {
      await document.fonts.load("26px Amiri").catch(() => {});
      g.direction = "rtl"; g.font = '26px Amiri, "Traditional Arabic", serif';
      for (const w of text.body.split(/\s+/)) {
        const last = lines.length - 1, joined = last < 0 ? w : lines[last] + " " + w;
        if (last >= 0 && g.measureText(joined).width <= areaW - 2 * pad) lines[last] = joined; else lines.push(w);
      }
      if (lines.length > 14) { lines.length = 14; lines[13] += " …"; }
    }
    const textH = text ? 70 + lines.length * lineH + pad : 0;
    const h = Math.max(img.height + textH, y);
    // the site's disclaimer under the caption, wrapped at its " · " separators to the image width
    g.direction = "rtl"; g.font = font(400, 19);
    const note = [];
    for (const part of NOTICE.split(" · ")) {
      const last = note.length - 1, joined = last < 0 ? part : note[last] + " · " + part;
      if (last >= 0 && g.measureText(joined).width <= cv.width - 48) note[last] = joined; else note.push(part);
    }
    const noteH = note.length * 30 + 18;
    cv.height = h + bar + noteH;
    g.fillStyle = bg; g.fillRect(0, 0, cv.width, cv.height);
    g.drawImage(img, colW + (areaW - img.width) / 2, text ? 0 : (h - img.height) / 2);
    if (text) {
      const ty = img.height + (h - img.height - textH) / 2, right = cv.width - pad;
      g.fillStyle = css("--line"); g.fillRect(colW + pad, ty, areaW - 2 * pad, 1);
      g.direction = "rtl"; g.textAlign = "right"; g.textBaseline = "middle";
      g.font = font(700, 24); g.fillStyle = css("--gold"); g.fillText(text.title, right, ty + 36);
      g.font = '26px Amiri, "Traditional Arabic", serif'; g.fillStyle = css("--ink");
      lines.forEach((l, i) => g.fillText(l, right, ty + 70 + lineH / 2 + i * lineH));
    }
    if (side) {
      g.fillStyle = css("--line"); g.fillRect(colW, 0, 2, h);
      g.direction = "rtl"; g.textBaseline = "middle";
      for (const o of ops) {
        if (o.t === "h") { g.font = font(700, 28); g.fillStyle = css("--ink"); g.textAlign = "right"; g.fillText(o.text, colW - pad, o.y); }
        else if (o.t === "g") {
          g.font = font(700, 22); g.fillStyle = css("--gold"); g.textAlign = "right"; g.fillText(o.text, colW - pad, o.y);
          g.fillStyle = css("--muted"); g.textAlign = "left"; g.fillText(String(o.n), pad, o.y);
        } else {
          const col = css("--c-" + o.it.cls) || css("--muted");
          g.beginPath(); g.roundRect(o.x, o.y, o.w, chipH, chipH / 2);
          g.fillStyle = css("--panel") || bg; g.fill(); g.lineWidth = o.it.madar ? 3 : 1.5; g.strokeStyle = o.it.madar ? css("--gold") : css("--line"); g.stroke();
          g.beginPath(); g.arc(o.x + o.w - 20, o.y + chipH / 2, 6, 0, 7); g.fillStyle = col; g.fill();
          g.font = font(400, 20); g.fillStyle = css("--ink"); g.textAlign = "right";
          g.fillText(o.it.label, o.x + o.w - 36, o.y + chipH / 2 + 1, o.w - 48);
        }
      }
    }
    g.fillStyle = css("--line"); g.fillRect(0, h, cv.width, 2);
    g.direction = "rtl"; g.textBaseline = "middle"; g.font = "700 26px Tajawal, -apple-system, sans-serif";
    g.fillStyle = css("--gold"); g.textAlign = "right"; g.fillText("نور السنة", cv.width - 24, h + bar / 2);
    g.font = "22px Tajawal, -apple-system, sans-serif"; g.fillStyle = css("--ink");
    g.textAlign = "center"; g.fillText(caption, cv.width / 2, h + bar / 2);
    g.fillStyle = css("--muted"); g.textAlign = "left"; g.direction = "ltr"; g.fillText(location.host, 24, h + bar / 2);
    g.direction = "rtl"; g.textAlign = "center"; g.font = font(400, 19); g.fillStyle = css("--muted");
    note.forEach((l, i) => g.fillText(l, cv.width / 2, h + bar + 15 + i * 30, cv.width - 48));
    return new Promise((ok) => cv.toBlob(ok, "image/png"));
  }
  function graphTools(el, get, reset, caption, file, side) {
    const box = el.parentElement, hint = $(".graph-hint", box);
    let t = null;
    box.addEventListener("click", (e) => {
      const b = e.target.closest("[data-z]"), c = get();
      if (!b || !c) return;
      if (b.dataset.z === "reset") return reset();
      if (b.dataset.z === "shot" || b.dataset.z === "share") return shareGraph(b, c, b.dataset.z === "share");
      if (b.dataset.z === "full") return document.fullscreenElement ? document.exitFullscreen() : (box.requestFullscreen || box.webkitRequestFullscreen).call(box);
      const center = { x: c.width() / 2, y: c.height() / 2 };
      c.animate({ zoom: { level: c.zoom() * (b.dataset.z === "in" ? 1.3 : 1 / 1.3), renderedPosition: center } }, { duration: 150 });
    });
    // save the image; or share it with the link (system share sheet), falling back to saving + copying the link
    async function shareGraph(b, c, share) {
      const flash = (t) => { b.title = t; b.classList.add("done"); setTimeout(() => { b.classList.remove("done"); b.title = share ? "مشاركة الصورة والرابط" : "لقطة: حفظ صورة الشجرة"; }, 1800); };
      const blob = await graphPNG(c, caption, side && side()), f = new File([blob], file + ".png", { type: "image/png" });
      const data = { files: [f], title: "نور السنة: " + caption, text: "نور السنة: " + caption + "\n" + location.href };
      if (share && navigator.canShare && navigator.canShare(data)) {
        try { await navigator.share(data); } catch (_) { /* cancelled */ }
        return;
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = f.name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      if (!share) return flash("حُفظت الصورة ✓");
      try { await navigator.clipboard.writeText(location.href); flash("حُفظت الصورة ونُسخ الرابط ✓"); } catch (_) { flash("حُفظت الصورة"); }
    }
    // fullscreen: the canvas changes size, so resize and refit; button toggles to "exit"
    box.addEventListener("fullscreenchange", () => {
      const on = document.fullscreenElement === box, fb = $('[data-z="full"]', box), c = get();
      fb.title = fb.ariaLabel = on ? "الخروج من ملء الشاشة" : "ملء الشاشة";
      if (c) { c.resize(); reset(); }
    });
    box.addEventListener("wheel", (e) => {
      if (e.ctrlKey || e.metaKey) return;
      e.stopPropagation();
      hint.classList.add("flash");
      clearTimeout(t);
      t = setTimeout(() => hint.classList.remove("flash"), 1400);
    }, { capture: true });
  }

  // fit, but never shrink below a legible zoom: keep the anchor (root) in view instead
  function readable(c, anchorId, center = false) {
    c.fit(undefined, 16);
    const MIN = 0.7;
    if (c.zoom() >= MIN) return;
    c.zoom(MIN);
    const node = c.getElementById(anchorId);
    if (!node.length) return c.center();
    c.center(node);
    if (!center) c.panBy({ x: c.width() / 2 - node.renderedWidth() / 2 - 16, y: 0 });
  }

  function selectNode(node, G) {
    const id = node.id();
    const path = node.predecessors().union(node.successors()).union(node);
    cy.elements().addClass("dim").removeClass("hl");
    path.removeClass("dim");
    path.edges().addClass("hl");
    const side = $("#side");
    const info = G.nar[id] || { name: id, cls: "unknown" };
    if (SPECIAL.has(id) || info.cls === "taliq" || info.cls === "mubham") {
      side.innerHTML = `<h3>${esc(info.name)}</h3><p class="muted small">${info.cls === "taliq" ? "موضع حذف في أول الإسناد من جهة المصنف (تعليق)." : `${fmt(node.connectedEdges().length)} طريقًا متصلًا مباشرة.`}</p>`;
      return;
    }
    const students = node.outgoers("node").map((n) => n.id());
    const teachers = node.incomers("node").map((n) => n.id());
    const nm = (x) => esc(shortName((G.nar[x] || {}).name || x));
    side.innerHTML = `<h3 class="cls-${info.cls}"><span class="dot"></span>${esc(info.name)}</h3>
      <dl class="facts">
        <dt>الرتبة</dt><dd>${esc(info.rank || CLS_LABEL[info.cls])}</dd>
        ${info.tabaka ? `<dt>الطبقة</dt><dd>${info.tabaka}</dd>` : ""}
        ${info.death ? `<dt>الوفاة</dt><dd>${esc(info.death)}${/هـ/.test(info.death) ? "" : " هـ"}</dd>` : ""}
        ${info.tadlis ? "<dt>تنبيه</dt><dd>موصوف بالتدليس</dd>" : ""}
        ${info.ikhtilat ? "<dt>تنبيه</dt><dd>اختلط في آخر عمره</dd>" : ""}
        <dt>في هذه الشجرة</dt><dd>${fmt(node.data("n"))} إسنادًا · ${fmt(students.length)} من الرواة عنه</dd>
      </dl>
      ${id === G.madar ? '<p class="notice">هذا الراوي مدار الحديث: تلتقي عنده الطرق ثم تتفرع عنه.</p>' : ""}
      <p class="small"><b>روى عن:</b> ${teachers.map(nm).join("، ") || "—"}</p>
      <p class="small"><b>روى عنه هنا:</b> ${students.map(nm).join("، ") || "—"}</p>
      <a class="btn" href="#/n/${encodeURIComponent(id)}">الترجمة الكاملة ←</a> <button class="btn" data-back>خريطة الرواة</button>`;
  }

  // ---------- narrator page ----------
  async function viewNarrator(id, linkDir, linkX) {
    const n = await narrator(id);
    if (!n) { app.innerHTML = '<div class="panel">الراوي غير موجود.</div>'; return; }
    const D = META.directory;
    const fixed = { nabi: ["النبي ﷺ", "nabi"], ...Object.fromEntries(BOOKS.map((b) => [b, [`الإمام ${AUTHOR[b]}`, "imam"]])) };
    const name = (x) => (D[x] ? D[x][0] : fixed[x] ? fixed[x][0] : x);
    const clsOf = (x) => (D[x] ? D[x][1] : fixed[x] ? fixed[x][1] : "unknown");
    const rel = (rows, dir) => rows.map(([x, c]) => {
      const inner = `<span class="dot"></span>${esc(shortName(name(x)))}`;
      const link = D[x] ? `<a href="#/n/${encodeURIComponent(x)}">${inner}</a>` : `<span>${inner}</span>`;
      return `<span class="chip cls-${clsOf(x)}">${link}<button class="link-n" data-dir="${dir}" data-x="${esc(x)}" title="عرض أحاديث هذا الطريق">${fmt(c)}</button></span>`;
    }).join(" ");
    const facts = [
      ["الاسم", n.full], ["الكنية", n.kunya], ["اللقب", n.laqab], ["النسب", n.nasab],
      ["الطبقة", n.tabaka_text || (n.tabaka && `${n.tabaka} — ${n.tabaka_label}`)],
      ["المولد", n.birth], ["الوفاة", n.death], ["مكان الوفاة", n.death_place],
      ["الإقامة", n.iqama], ["الرحلة", n.rihla], ["المذهب", n.madhhab], ["علاقات الراوي", n.relation],
    ].filter(([, v]) => v);
    const flags = [n.tadlis ? "موصوف بالتدليس" : "", n.ikhtilat ? "اختلط" : ""].filter(Boolean);
    app.innerHTML = `
      <div class="crumbs"><a href="#/narrators">الرواة</a> · <a href="${mailto(`نور السنة: ملاحظة على ترجمة ${n.name} (${n.id})`)}">أبلغ عن خطأ في هذه الترجمة</a></div>
      <h1 class="cls-${n.cls}"><span class="dot" style="width:14px;height:14px"></span>${esc(n.name)}</h1>
      <div class="summary">
        <span class="pill">${esc(CLS_LABEL[n.cls] || "")}</span>
        ${chainsOf(n.id)}
        ${flags.map((f) => `<span class="pill" style="color:var(--c-maqbul)">${f}</span>`).join("")}
        ${BOOKS.filter((b) => (n.hadiths || {})[b]).map((b) => `<button class="pill" data-book="${b}" title="عرض أحاديثه في ${AUTHOR[b]}">${AUTHOR[b]}: <b>${fmt(n.hadiths[b].length)}</b></button>`).join("")}
        ${n.hadiths ? `<span class="pill" title="مجموع المواضع في الكتب التسعة، وعدد الأحاديث بعد حذف المكرر داخل كل كتاب وبين الكتب (تقريبي)">المجموع: <b>${fmt(D[n.id] ? totalOf(D[n.id]) : 0)}</b> · بدون المكرر <b>${fmt(n.uniq || 0)}</b></span>` : ""}
        <span class="pill">شيوخه: <b>${fmt(n.n_teachers)}</b></span>
        <span class="pill">تلاميذه: <b>${fmt(n.n_students)}</b></span>
      </div>
      <div class="grid g2">
        <div class="panel"><h2>الترجمة</h2>
          ${n.rank || n.rank_dhahabi ? `<div class="verdicts">
            ${n.rank ? `<blockquote><cite>رتبته عند ابن حجر</cite>${esc(n.rank)}${rankNote(n)}</blockquote>` : ""}
            ${n.rank_dhahabi ? `<blockquote><cite>رتبته عند الذهبي</cite>${esc(n.rank_dhahabi)}</blockquote>` : ""}</div>` : ""}
          ${n.hady ? `<div class="verdicts"><blockquote><cite>قال ابن حجر في «هدي الساري» مقدمة «فتح الباري» (ص ${esc(n.hady[1])}، ط السلفية) — <a href="https://shamela.ws/book/1673/${n.hady[0]}" target="_blank" rel="noopener">المكتبة الشاملة</a></cite>${esc(n.hady[2])}</blockquote></div>` : ""}
          <dl class="facts">${facts.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
        </div>
        <div class="panel"><h2>شبكة الراوي</h2><p class="muted small">أبرز شيوخه (يمينًا) وتلاميذه (يسارًا) في الكتب التسعة — اضغط الاسم للانتقال، والسهم لعرض أحاديث الطريق</p>${graphBox('<div id="ego"></div>')}
          <div class="legend">${["nabi", "sahabi", "thiqa", "saduq", "maqbul", "weak", "unknown"].map((c) => `<span class="cls-${c}"><i style="background:var(--c)"></i>${CLS_LABEL[c]}</span>`).join("")}<span class="muted">سُمك الخط = عدد الأسانيد</span></div></div>
      </div>
      ${followPanel(n, name)}
      <div class="grid g2" style="margin-top:16px">
        <div class="panel"><h2>روى عن</h2><p class="muted small">مع عدد الأسانيد في الكتب التسعة — اضغط العدد لعرض الأحاديث</p><div class="chain" id="rel-t">${rel(n.teachers || [], "t") || '<span class="muted">—</span>'}</div></div>
        <div class="panel"><h2>روى عنه</h2><p class="muted small">مع عدد الأسانيد في الكتب التسعة — اضغط العدد لعرض الأحاديث</p><div class="chain" id="rel-s">${rel(n.students || [], "s") || '<span class="muted">—</span>'}</div></div>
      </div>
      <div class="section-title"><h2 id="htitle">أحاديثه في الكتب التسعة</h2><div class="seg" id="hbook"></div><div class="seg" id="hrep"><button data-v="" class="on">مع المكرر</button><button data-v="u" title="الحديث الذي كرره المصنف يظهر في أول مواضعه فقط">بدون المكرر</button></div></div>
      <div class="panel" id="hlist"></div>`;
    // the list shows either all his hadiths or one link (teacher → him, or him → student), optionally per book
    let book = "", edge = null, uniq = false;
    const dup = new Set(n.dup || []);
    const ego = drawEgo(n, name, clsOf, (dir, x) => pickEdge(dir, x));
    const show = () => {
      const inEdge = (k) => (!edge || edge.keys.has(k)) && !(uniq && dup.has(k));
      const counts = Object.fromEntries(BOOKS.filter((b) => (n.hadiths || {})[b]).map((b) => [b, n.hadiths[b].filter(inEdge).length]));
      if (book && !counts[book]) book = "";
      const total = Object.values(counts).reduce((a, c) => a + c, 0);
      $("#hbook").innerHTML = `<button data-v="" class="${book ? "" : "on"}">الكل <span class="small">${fmt(total)}</span></button>` + Object.entries(counts).filter(([, c]) => c)
        .map(([b, c]) => `<button data-v="${b}" class="${b === book ? "on" : ""}">${AUTHOR[b]} <span class="small">${fmt(c)}</span></button>`).join("");
      const me = esc(shortName(n.name)), other = edge && esc(shortName(name(edge.x)));
      $("#htitle").innerHTML = !edge ? "أحاديثه في الكتب التسعة"
        : `${edge.dir === "t" ? `ما رواه ${me} عن ${other}` : `ما رواه ${other} عن ${me}`} <button class="btn" id="hclear" style="margin-inline-start:8px">عرض كل أحاديثه</button>`;
      if (edge) $("#hclear").addEventListener("click", () => pickEdge(null));
      app.querySelectorAll(".link-n").forEach((b) => b.classList.toggle("on", !!edge && b.dataset.dir === edge.dir && b.dataset.x === edge.x));
      ego.edges().removeClass("on");
      if (edge) ego.edges(`[dir = "${edge.dir}"]`).filter((e) => e.data("x") === edge.x).addClass("on");
      renderNarratorHadiths(n, 1, book, edge && edge.keys, uniq && dup);
    };
    const pickEdge = (dir, x) => {
      const row = dir && (dir === "t" ? n.teachers : n.students).find((r) => r[0] === x);
      edge = row ? { dir, x, keys: new Set(row[2] || []) } : null;
      book = "";
      // the address follows the chosen link so it can be shared; replaceState does not re-route
      history.replaceState(history.state, "", `#/n/${encodeURIComponent(n.id)}${edge ? `/${dir}/${encodeURIComponent(x)}` : ""}`);
      show();
      if (edge) $("#htitle").scrollIntoView({ behavior: "smooth" });
    };
    if (linkDir) pickEdge(linkDir, linkX); else show();
    const pickBook = (v) => { book = v; show(); };
    $("#hbook").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) pickBook(b.dataset.v); });
    $("#hrep").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; setSeg("#hrep", b); uniq = !!b.dataset.v; show(); });
    app.querySelectorAll(".summary [data-book]").forEach((b) => b.addEventListener("click", () => {
      if (edge) pickEdge(null);
      pickBook(b.dataset.book);
      $("#hlist").scrollIntoView({ behavior: "smooth" });
    }));
    app.querySelectorAll(".link-n").forEach((b) => b.addEventListener("click", () => pickEdge(b.dataset.dir, b.dataset.x)));
  }

  // what Ibn Hajar's word means: his rank among the twelve, and the notes on tadlis and ikhtilat
  function rankNote(n) {
    const lv = rankLevel(n.rank, n.cls);
    const parts = lv ? [`<b>المرتبة ${["الأولى", "الثانية", "الثالثة", "الرابعة", "الخامسة", "السادسة", "السابعة", "الثامنة", "التاسعة", "العاشرة", "الحادية عشرة", "الثانية عشرة"][lv - 1]} من مراتب «التقريب» (${RANKS[lv - 1][0]}):</b> ${esc(RANKS[lv - 1][2])}`] : [];
    if (n.tadlis) parts.push(`<b>${TERMS.tadlis[0]}:</b> ${esc(TERMS.tadlis[1])}`);
    if (n.ikhtilat) parts.push(`<b>${TERMS.ikhtilat[0]}:</b> ${esc(TERMS.ikhtilat[1])}`);
    return parts.length ? `<div class="rank-note">${parts.map((p) => `<p>${p}</p>`).join("")}<a href="#/terms">مراتب الرواة ومصطلحاتها ←</a></div>` : "";
  }

  // for the narrators below صدوق: does another route carry each of his hadiths (pipeline follow_up)?
  const FOLLOW = {
    q: ["مقرون بغيره", "maqrun"], t: ["متابعة تامة", "mutabaa"], s: ["متابعة قاصرة", "mutabaa"],
    h: ["له شاهد", "shahid"], f: ["لم نجد له طريقًا آخر", "fard"],
  };
  function followPanel(n, name) {
    const F = n.follow;
    if (!F) return "";
    const books = BOOKS.filter((b) => (n.hadiths || {})[b]);
    const count = (code, b) => (b ? n.hadiths[b] : Object.keys(F)).filter((k) => F[k] && F[k][0] === code).length;
    const label = (x) => esc(shortName(x.startsWith("u:") ? x.slice(2) : name(x)));
    const row = (k) => {
      const [code, x, r] = F[k] || ["f", "", ""];
      const who = x && code !== "s" ? (META.directory[x] ? `<a href="#/n/${encodeURIComponent(x)}">${label(x)}</a>` : label(x)) : "";
      const what = { q: `قرنه بـ${who}`, t: `تابعه ${who}`, s: "رُوي عن صحابيّه من طريق أخرى", h: `شاهده من حديث ${who}`, f: "" }[code];
      const where = r && r !== k ? ` <span class="muted">في</span> <a href="#/h/${r}">${hkey(r)}</a>` : r ? ' <span class="muted">في الحديث نفسه</span>' : "";
      return `<li><a href="#/h/${k}">${hkey(k)}</a> <span class="fw fw-${code}">${FOLLOW[code][0]}</span> ${what}${what ? where : ""}</li>`;
    };
    const intro = n.cls === "maqbul"
      ? `قال ابن حجر في «المقبول»: «مقبول حيث يُتابَع، وإلا فليّن الحديث». فالسؤال في كل حديث له: هل وافقه غيره؟`
      : "من تُكلِّم فيه يُعتبر بحديثه إذا وافقه غيره، ويُتوقّف فيما تفرّد به.";
    const summary = (b) => Object.keys(FOLLOW).map((c) => [c, count(c, b)]).filter(([, v]) => v)
      .map(([c, v]) => `<span class="fw fw-${c}">${FOLLOW[c][0]}: <b>${fmt(v)}</b></span>`).join(" ");
    return `<div class="panel follow" style="margin-top:16px"><h2>هل تُوبع على أحاديثه؟</h2>
      <p>${intro}</p>
      <p class="small">${summary()}</p>
      ${books.map((b) => `<details${SAHIHAYN.has(b) || books.length === 1 ? " open" : ""}><summary>${AUTHOR[b]} — ${fmt(n.hadiths[b].length)} · ${summary(b)}</summary>
        <ul>${n.hadiths[b].slice(0, 300).map(row).join("")}</ul>${n.hadiths[b].length > 300 ? `<p class="muted small">أول 300 موضع من ${fmt(n.hadiths[b].length)}</p>` : ""}</details>`).join("")}
      <p class="muted small">آلي تقريبي: يُبحث في أسانيد الحديث نفسه وما ربطه به برنامج الجامع من رواياته في الكتب التسعة فقط، فقد تكون له متابعة أو شاهد خارجها. ومعاني المصطلحات: ${["mutabaa", "shahid", "maqrun", "usul"].map(termLink).join("، ")}.</p>
    </div>`;
  }

  function viewTerms() {
    app.innerHTML = `${subnav("narrators", "terms")}<div class="panel terms" style="max-width:860px">
      <h1>مراتب الرواة ومصطلحاتها</h1>
      <p>رتب الرواة المعروضة في الموقع هي ألفاظ الحافظ ابن حجر في «تقريب التهذيب». وقد قسّم الرواة في مقدمته اثنتي عشرة مرتبة، هذا نصه فيها مع بيان مختصر:</p>
      <ol class="ranks">${RANKS.map(([t, def, note]) => `<li><h3>${t}</h3><blockquote>${esc(def)}</blockquote><p>${esc(note)}</p></li>`).join("")}</ol>
      <p class="muted small">ألوان الرواة في الشجرات: الثقة للمرتبتين الثانية والثالثة، والصدوق للرابعة والخامسة، و«مقبول / مجهول الحال» للسادسة والسابعة، و«تُكلِّم فيه» لما بعدها.</p>
      <h2>مصطلحات الأسانيد</h2>
      <dl class="facts terms-dl">${Object.values(TERMS).map(([t, d]) => `<dt>${t}</dt><dd>${esc(d)}</dd>`).join("")}</dl>
      <h2>لماذا يروي الشيخان عمن دون الثقة؟</h2>
      <p>أحاديث الصحيحين صحيحة بحكم الشيخين وتلقي الأمة لهما بالقبول. ورواية الشيخين عمن قيل فيه «مقبول» أو تُكلِّم فيه تكون غالبًا في المتابعات والشواهد، أو مقرونًا بغيره، أو مما انتقياه من صحيح حديثه. وقد عقد ابن حجر في «هدي الساري» مقدمة «فتح الباري» فصلًا لمن تُكلِّم فيه من رجال البخاري، يذكر فيه وجه إخراجه له. وفي صفحة كل راوٍ من هؤلاء بيانٌ آلي لموقع كل حديث له: هل تُوبع عليه أو له شاهد أو انفرد به.</p>
    </div>`;
  }

  async function renderNarratorHadiths(n, page, book = "", only = null, skip = null) {
    const box = $("#hlist");
    box.innerHTML = LOADING;
    const books = BOOKS.filter((b) => (n.hadiths || {})[b] && (!book || b === book));
    const keys = books.flatMap((b) => n.hadiths[b]).filter((k) => (!only || only.has(k)) && !(skip && skip.has(k)));
    const idx = await searchIndex(books);
    const textOf = new Map(idx.map((r) => [r[0], r]));
    const pages = Math.ceil(keys.length / PAGE);
    const slice = keys.slice((page - 1) * PAGE, page * PAGE);
    box.innerHTML = `<ul class="list">${slice.map((k) => {
      const r = textOf.get(k);
      return `<li><div class="meta-line"><a href="#/h/${k}">${hkey(k)}</a>${r && r[3] ? `<span>${esc(r[3])}</span>` : ""}</div><div class="snip">${esc(clip(r ? r[2] : "", 200))}</div></li>`;
    }).join("")}</ul>${pages > 1 ? `<div class="pager">${page > 1 ? '<button class="btn" data-p="-1">السابق</button>' : ""}<span class="muted">${page} / ${pages}</span>${page < pages ? '<button class="btn" data-p="1">التالي</button>' : ""}</div>` : ""}`;
    box.querySelectorAll("[data-p]").forEach((b) => b.addEventListener("click", () => {
      renderNarratorHadiths(n, page + +b.dataset.p, book, only, skip);
      box.scrollIntoView({ behavior: "smooth" });
    }));
  }

  function drawEgo(n, name, clsOf, onEdge) {
    const T = (n.teachers || []).slice(0, 12), S = (n.students || []).slice(0, 12);
    const els = [{ data: { id: n.id, label: shortName(n.name), cls: n.cls, me: 1 } }];
    for (const [x, c] of T) { els.push({ data: { id: "t" + x, ref: x, label: shortName(name(x)), cls: clsOf(x) } }); els.push({ data: { source: "t" + x, target: n.id, w: c, dir: "t", x } }); }
    for (const [x, c] of S) { els.push({ data: { id: "s" + x, ref: x, label: shortName(name(x)), cls: clsOf(x) } }); els.push({ data: { source: n.id, target: "s" + x, w: c, dir: "s", x } }); }
    const color = (c) => css(`--c-${c}`) || css("--c-unknown");
    const ego = cytoscape({
      container: $("#ego"), elements: els, minZoom: 0.2, maxZoom: 2, wheelSensitivity: 0.25,
      layout: { name: "dagre", rankDir: "RL", nodeSep: 6, rankSep: 90, padding: 12 },
      style: [
        { selector: "node", style: { "shape": "round-rectangle", "width": "label", "height": "label", "padding": "6px", "background-color": css("--panel"),
          "border-width": 2, "border-color": (e) => color(e.data("cls")), "label": "data(label)", "color": css("--ink"),
          "font-family": "-apple-system, BlinkMacSystemFont, Tajawal, sans-serif", "font-size": 11, "text-valign": "center", "text-wrap": "wrap", "text-max-width": 90 } },
        { selector: "node[me = 1]", style: { "background-color": css("--accent"), "color": css("--accent-ink"), "font-size": 13, "font-weight": 700 } },
        { selector: "edge", style: { "width": (e) => Math.min(1 + Math.log2(e.data("w")), 6), "line-color": css("--gold"), "line-opacity": 0.55, ...CURVE,
          "target-arrow-shape": "triangle", "target-arrow-color": css("--gold"), "arrow-scale": 0.7,
          "overlay-padding": 8, "overlay-opacity": 0 } },
        { selector: "edge.hover, edge.on", style: { "line-color": css("--accent"), "target-arrow-color": css("--accent"), "line-opacity": 1, "z-index": 9 } },
      ],
    });
    curves(ego);
    readable(ego, n.id, true);
    graphTools($("#ego"), () => ego, () => readable(ego, n.id, true), "شبكة " + n.name, `rawi-${n.id}`);
    ego.on("tap", "node", (e) => {
      const ref = e.target.data("ref");
      if (ref && META.directory[ref]) go("#/n/" + encodeURIComponent(ref));
    });
    ego.on("tap", "edge", (e) => onEdge(e.target.data("dir"), e.target.data("x")));
    ego.on("mouseover", "edge", (e) => { e.target.addClass("hover"); ego.container().style.cursor = "pointer"; });
    ego.on("mouseout", "edge", (e) => { e.target.removeClass("hover"); ego.container().style.cursor = ""; });
    return ego;
  }

  // ---------- narrators directory ----------
  // directory rows: [name, grade, places per book, places per book without repeats, total without repeats]
  async function viewNarrators() {
    const all = Object.entries(META.directory);
    app.innerHTML = `${subnav("narrators", "narrators")}<h1>فهرس الرواة</h1><p class="muted">${fmt(all.length)} راويًا في أسانيد الكتب التسعة <span id="nc"></span></p>
      <div class="panel nfilters">
        <label class="fl"><span>الاسم</span><input id="nf" type="search" placeholder="تصفية بالاسم…"></label>
        <div class="fl"><span>الكتاب</span><div class="seg" id="bf"><button data-v="" class="on">الكتب التسعة</button>${BOOKS.map((b) => `<button data-v="${b}">${AUTHOR[b]}</button>`).join("")}</div></div>
        <div class="frow">
          <div class="fl"><span>الرتبة</span><div class="seg" id="cf"><button data-v="" class="on">الكل</button>${["sahabi", "thiqa", "saduq", "maqbul", "weak"].map((c) => `<button data-v="${c}">${CLS_LABEL[c]}</button>`).join("")}</div></div>
          <div class="fl"><span>طريقة العد</span><div class="seg" id="rf"><button data-v="" class="on">مع المكرر</button><button data-v="u">بدون المكرر</button></div></div>
        </div>
        <p class="muted small" id="nnote"></p>
        <p class="small" style="margin:0"><a href="#/explore">ترتيب الرواة بالطبقة والبلد والتدليس والمدار وشيوخ أصحاب الكتب ←</a></p>
      </div>
      <div class="panel" style="margin-top:16px"><ul class="bars" id="nl"></ul></div>`;
    let q = "", cls = "", book = "", uniq = false;
    const bi = (b) => BOOKS.indexOf(b);
    // the measure the list is sorted and totalled by
    const value = (v) => (book ? (uniq ? v[3] : v[2])[bi(book)] : uniq ? v[4] : totalOf(v));
    const render = () => {
      const nq = norm(q);
      const rows = all.filter(([, v]) => (!cls || v[1] === cls) && (!nq || norm(v[0]).includes(nq)) && value(v) > 0)
        .sort((a, b) => value(b[1]) - value(a[1]));
      $("#nc").textContent = rows.length === all.length ? "" : `· المطابق ${fmt(rows.length)}`;
      $("#nnote").textContent = (uniq
        ? "بدون المكرر: الحديث الذي كرره المصنف في أكثر من موضع يُعدّ مرة واحدة، وفي الإجمالي يُعدّ الحديث المروي في أكثر من كتاب مرة واحدة كذلك. العدّ آلي تقريبي بحسب روابط التخريج في المصدر"
        : "مع المكرر: عدد المواضع (الأرقام) التي ورد الراوي في إسنادها، فالحديث المكرر يُعدّ في كل موضع") +
        (book ? ` — مرتبون حسب ${BOOK[book]}` : " — مرتبون حسب الإجمالي");
      const counts = (v) => BOOKS.map((b, i) => { const c = (uniq ? v[3] : v[2])[i]; return c && b !== book ? `${AUTHOR[b]} ${fmt(c)}` : ""; }).filter(Boolean).join(" · ");
      $("#nl").innerHTML = rows.slice(0, 300).map(([id, v]) => `<li><span class="name"><a href="#/n/${encodeURIComponent(id)}" class="cls-${v[1]}"><span class="dot"></span>${esc(v[0])}</a></span><span class="num"><b class="ntotal" title="${book ? `في ${BOOK[book]}` : "الإجمالي"} ${uniq ? "بدون المكرر" : "مع المكرر"}">${fmt(value(v))}</b> <span class="muted">${book ? `الإجمالي ${fmt(uniq ? v[4] : totalOf(v))} · ` : ""}${counts(v)}</span></span></li>`).join("") || '<li class="muted">لا نتائج</li>';
    };
    render();
    $("#nf").addEventListener("input", (e) => { q = e.target.value; render(); });
    const seg = (sel, set) => $(sel).addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; set(b.dataset.v); setSeg(sel, b); render(); });
    seg("#cf", (v) => { cls = v; });
    seg("#bf", (v) => { book = v; });
    seg("#rf", (v) => { uniq = !!v; });
  }

  // ---------- statistics explorer ----------
  // explore.json nar rows: [tabaqa, death year, cities, tadlis | ikhtilat << 1, chains each compiler heard from him, madar]
  const MEASURES = {
    r: ["المواضع (مع المكرر)", "عدد المواضع التي ورد الراوي في إسنادها، فالحديث المكرر يُعدّ في كل موضع"],
    u: ["الأحاديث بدون المكرر", "الحديث الذي كرره المصنف يُعدّ مرة واحدة، وفي الإجمالي يُعدّ الحديث المروي في أكثر من كتاب مرة واحدة. عدّ آلي تقريبي بحسب روابط التخريج في المصدر"],
    s: ["شيخ مباشر لصاحب الكتاب", "عدد الأسانيد التي حدّث بها صاحب الكتاب عن الراوي مباشرة"],
    d: ["المدار", "عدد الأحاديث التي تلتقي عنده طرقها في الكتب التسعة ثم تتفرع عنه (محسوب آليًا)"],
  };
  const TABAQA_GROUPS = { "1": ["الصحابة", 1, 1], nc: ["من بعد الصحابة", 2, 12], tb: ["التابعون", 2, 6], at: ["أتباع التابعين", 7, 9], ak: ["الآخذون عن أتباع التابعين", 10, 12] };
  const TABAQA_NAMES = ["", "الصحابة", "كبار التابعين", "الوسطى من التابعين", "تلي الوسطى من التابعين", "صغار التابعين", "عاصروا صغار التابعين",
    "كبار أتباع التابعين", "الوسطى من أتباع التابعين", "صغار أتباع التابعين", "كبار الآخذين عن تبع الأتباع", "الوسطى من الآخذين عن تبع الأتباع", "صغار الآخذين عن تبع الأتباع"];
  const PRESETS = [
    ["أكثر الصحابة رواية في الكتب التسعة", { t: "1", m: "u" }],
    ["أكثر الصحابة رواية في صحيح البخاري", { b: "bukhari", t: "1", m: "u" }],
    ["أكثر الصحابة رواية في صحيح مسلم", { b: "muslim", t: "1", m: "u" }],
    ["أكثر الرواة ورودًا في صحيح البخاري", { b: "bukhari", m: "r" }],
    ["أكثر شيوخ البخاري", { b: "bukhari", m: "s" }],
    ["أكثر شيوخ مسلم", { b: "muslim", m: "s" }],
    ["أكثر شيوخ الإمام أحمد", { b: "ahmad", m: "s" }],
    ["أكثر التابعين رواية", { t: "tb", m: "u" }],
    ["أكثر الرواة مدارًا", { m: "d" }],
    ["أكثر المدلسين رواية", { f: "1", m: "u" }],
    ["أكثر من تُكلِّم فيه رواية", { c: "weak", m: "u" }],
    ["أكثر رواة المدينة", { city: "المدينة", m: "u" }],
    ["أكثر رواة الكوفة", { city: "الكوفة", m: "u" }],
    ["أكثر رواة البصرة", { city: "البصرة", m: "u" }],
    ["أكثر الصحابيات رواية", { t: "1", g: "f", m: "u" }],
    ["أكثر النساء رواية بعد الصحابة", { t: "nc", g: "f", m: "u" }],
    ["رجال الشيخين الأكثر رواية", { b: "bukhari", y: "muslim", m: "u" }],
    ["رجال انفرد بهم البخاري عن مسلم", { b: "bukhari", x: "muslim", m: "u" }],
    ["رجال انفرد بهم مسلم عن البخاري", { b: "muslim", x: "bukhari", m: "u" }],
    ["شيوخ البخاري الذين لم يرو عنهم مسلم", { b: "bukhari", x: "muslim", m: "s" }],
  ];
  // presets fall under the first group whose pattern matches their label
  const PRESET_GROUPS = [["الصحابة والصحابيات", /^أكثر الصحاب/], ["الشيخان", /الشيخين|انفرد|لم يرو/], ["شيوخ أصحاب الكتب", /شيوخ/],
    ["الرواة", /./]];
  // the ranking's filters; the comparison's own settings are prefixed with c
  const EXPLORE_DEFAULT = { b: "", m: "u", t: "", c: "", city: "", f: "", g: "", y: "", x: "", n: "20", q: "" };
  const COMPARE_DEFAULT = { ca: "bukhari", cb: "muslim", cm: "u", ct: "", cs: "", cn: "15" };

  // ---------- a book's chains by the weakest grade among their narrators ----------
  const CHAIN_COLOR = { thiqat: "--c-thiqa", saduq: "--c-saduq", mutakallam: "--c-weak", unknown: "--c-unknown" };
  async function viewChains(query) {
    const st = { b: "bukhari", c: "mutakallam", n: "" };
    for (const [k, v] of new URLSearchParams(query || "")) if (k in st) st[k] = v;
    if (!BOOKS.includes(st.b)) st.b = "bukhari";
    if (!(st.c in CHAIN_LABEL)) st.c = "mutakallam";
    const D = META.directory, cache = {};
    app.innerHTML = `
      ${subnav("isnads", "chains")}
      <div class="section-title" style="margin-top:0"><h1>رجال الأسانيد</h1><p>أسانيد كل كتاب موصوفةً بأدنى رتبة فيها عند ابن حجر</p></div>
      <div class="panel">
        <div class="seg" id="chb">${BOOKS.map((b) => `<button data-v="${b}" class="${b === st.b ? "on" : ""}">${AUTHOR[b]}</button>`).join("")}</div>
        <div class="legend" id="chc"></div>
        <p class="muted small" style="margin-top:10px">وصفٌ لرجال الأسانيد المفردة لا حكمٌ على الأحاديث: فأحاديث الصحيحين صحيحة بحكم الشيخين، وأحاديث بقية الكتب يُرجع في الحكم عليها إلى أحكام المحدثين.</p>
      </div>
      <div class="grid g2" style="margin-top:16px">
        <div class="panel" id="chwho"></div>
        <div class="panel"><h2 id="chtitle"></h2><p class="muted small" id="chnote"></p><ul class="list" id="chl"></ul><p id="chmore"></p></div>
      </div>`;
    const nameLink = (id) => { const n = D[id]; return n ? `<a href="#/n/${encodeURIComponent(id)}" class="cls-${n[1]}"><span class="dot"></span>${esc(shortName(n[0]))}</a>` : ""; };
    let shown = 0, rows = [];
    const more = () => {
      const kitabs = META.books[st.b].kitabs;
      $("#chl").insertAdjacentHTML("beforeend", rows.slice(shown, shown + 100).map(([k, n, who]) => {
        const kitab = kitabs.find((x) => x.no === (META.index[k] || [])[0]);
        return `<li><div class="meta-line"><a href="#/h/${k}">${hkey(k)}</a>${n > 1 ? `<span class="tag">${counted(n, TURUQ_SORT.c[3])}</span>` : ""}${kitab ? `<span>${esc(kitab.title)}</span>` : ""}</div>${who.size ? `<div class="small">${[...who].map(nameLink).join(" · ")}</div>` : ""}</li>`;
      }).join(""));
      shown += 100;
      $("#chmore").innerHTML = shown < rows.length ? `<button class="btn" id="chmb">عرض المزيد (${fmt(rows.length - shown)})</button>` : "";
    };
    const render = async () => {
      const all = cache[st.b] || (cache[st.b] = await getJSON(`data/chains/${st.b}.json`));
      $("#chc").innerHTML = Object.keys(CHAIN_LABEL).filter((c) => all[c]).map((c) => `<button data-c="${c}" class="${c === st.c ? "on" : ""}" style="--c:var(${CHAIN_COLOR[c]})"><i class="ch-${c}"></i>${CHAIN_LABEL[c][0]} ${fmt(all[c].length)}</button>`).join("");
      const list = all[st.c] || [];
      // the narrators that most often give this book's chains this class
      const who = new Map();
      for (const [, ...ids] of list) for (const id of ids) who.set(id, (who.get(id) || 0) + 1);
      const top = [...who].sort((a, b) => b[1] - a[1]).slice(0, 15), max = top.length ? top[0][1] : 1;
      $("#chwho").innerHTML = top.length ? `<h2>الرواة الذين نزلوا بهذه الأسانيد</h2><p class="muted small">عدد أسانيد ${BOOK[st.b]} التي ورد فيها الراوي بهذه الرتبة. اضغط على العدد لعرض أسانيده</p>
        <ul class="bars">${top.map(([id, v]) => `<li${id === st.n ? ' class="on"' : ""}><span class="name">${nameLink(id)}</span><span class="num"><a href="#/chains?b=${st.b}&c=${st.c}&n=${encodeURIComponent(id)}">${fmt(v)} إسنادًا</a></span><span class="bar"><span style="width:${(100 * v) / max}%"></span></span></li>`).join("")}</ul>`
        : `<h2>${CHAIN_LABEL[st.c][0]}</h2><p class="muted">كل رجال هذه الأسانيد ثقات أو صحابة عند ابن حجر.</p>`;
      // a hadith's chains of this class shown together: [key, chains, narrators]
      const byKey = new Map();
      for (const [k, ...ids] of list) {
        if (st.n && !ids.includes(st.n)) continue;
        const r = byKey.get(k) || byKey.set(k, [k, 0, new Set()]).get(k);
        r[1]++; ids.forEach((id) => r[2].add(id));
      }
      rows = [...byKey.values()];
      const chains = rows.reduce((a, r) => a + r[1], 0);
      $("#chtitle").textContent = `${CHAIN_LABEL[st.c][0]} في ${BOOK[st.b]}`;
      $("#chnote").innerHTML = `${counted(chains, TURUQ_SORT.c[3])} في ${counted(rows.length, ["حديث", "حديثين", "أحاديث", "حديثًا"])}` + (st.n && D[st.n] ? ` فيها ${nameLink(st.n)} · <a href="#/chains?b=${st.b}&c=${st.c}">إلغاء التصفية</a>` : "");
      $("#chl").innerHTML = rows.length ? "" : '<li class="muted">لا أسانيد بهذا الوصف</li>'; shown = 0; more();
      const qs = new URLSearchParams(Object.entries(st).filter(([, v]) => v)).toString();
      try { history.replaceState(history.state, "", `#/chains?${qs}`); } catch (_) {}
    };
    await render();
    $("#chb").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; setSeg("#chb", b); st.b = b.dataset.v; render(); });
    $("#chc").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; st.c = b.dataset.c; st.n = ""; render(); });
    $("#chmore").addEventListener("click", (e) => { if (e.target.closest("#chmb")) more(); });
  }

  // ---------- hadiths ranked by their turuq in the nine books ----------
  // rows: [lead key, chains, hadiths, book prefixes, madar, companions, Jami' narrations, Jami' books, snippet]
  const TURUQ_DEFAULT = { s: "c", b: "", x: "", k: "", q: "", d: "", n: "50" };
  const TURUQ_SORT = {
    c: ["عدد الأسانيد", "مجموع أسانيده في الكتب التسعة", 1, ["إسناد", "إسنادان", "أسانيد", "إسنادًا"]],
    h: ["عدد المواضع", "مواضعه في الكتب التسعة مع المكرر", 2, ["موضع", "موضعان", "مواضع", "موضعًا"]],
    p: ["عدد الصحابة", "الصحابة الذين رووه في الكتب التسعة", 5, ["صحابي", "صحابيان", "صحابة", "صحابيًا"]],
    w: ["الانتشار في كتب السنة", "عدد رواياته في كتب السنة كلها في تخريج برنامج الجامع", 6, ["رواية", "روايتان", "روايات", "رواية"]],
  };
  // a number with its counted noun: 1 / 2 / 3–10 / 11+
  const counted = (n, [one, two, few, many]) => n === 1 ? one : n === 2 ? two : `${fmt(n)} ${n % 100 >= 3 && n % 100 <= 10 ? few : many}`;
  const TURUQ_PRESETS = [
    ["الأكثر أسانيد", {}],
    ["الأكثر صحابة", { s: "p" }],
    ["الأوسع انتشارًا في كتب السنة", { s: "w" }],
    ["المخرَّج في الكتب التسعة كلها", { k: "9" }],
    ["المتفق عليه", { b: "bukhari", y: "muslim" }],
  ];
  async function viewTuruq(query) {
    const R = await getJSON("data/turuq.json");
    const D = META.directory;
    const st = { ...TURUQ_DEFAULT, y: "" };
    for (const [k, v] of new URLSearchParams(query || "")) if (k in st) st[k] = v;
    const opt = (v, label, cur) => `<option value="${esc(v)}"${v === cur ? " selected" : ""}>${esc(label)}</option>`;
    const bookSel = (name, first) => `<select name="${name}">${opt("", first, st[name])}${BOOKS.map((b) => opt(b, BOOK[b], st[name])).join("")}</select>`;
    app.innerHTML = `
      ${subnav("hadiths", "turuq")}
      <div class="section-title" style="margin-top:0"><h1>ترتيب الأحاديث</h1><p>أحاديث الكتب التسعة مرتبةً بعدد أسانيدها ومواضعها ورواتها من الصحابة وانتشارها في كتب السنة</p></div>
      <div class="panel">
        <div class="presets" id="tpre">${TURUQ_PRESETS.map(([label], i) => `<button class="btn" data-i="${i}">${esc(label)}</button>`).join("")}</div>
        <div class="filters" id="tf">
          <label>الترتيب<select name="s">${Object.entries(TURUQ_SORT).map(([k, [l]]) => opt(k, l, st.s)).join("")}</select></label>
          <label>مخرَّج في${bookSel("b", "أي كتاب")}</label>
          <label>وفي${bookSel("y", "—")}</label>
          <label>وليس في${bookSel("x", "—")}</label>
          <label>عدد الكتب<select name="k">${opt("", "أي عدد", st.k)}${[2, 3, 4, 5, 6, 7, 8, 9].map((n) => opt(String(n), n === 9 ? "الكتب التسعة كلها" : `${n} كتب فأكثر`, st.k)).join("")}</select></label>
          <label>العدد<select name="n">${["20", "50", "100", "200", "500"].map((n) => opt(n, `أول ${n}`, st.n)).join("")}</select></label>
          <label class="grow">في المتن أو المدار<input name="q" type="search" value="${esc(st.q)}" placeholder="كلمة من المتن أو اسم المدار…"></label>
        </div>
        <h2 id="ttitle">الأحاديث الأكثر طرقًا</h2>
        <div class="xbar"><p class="muted small" id="tnote"></p>
          <button class="btn" id="treset">إعادة الضبط</button><button class="btn" id="tcopy">نسخ رابط هذا الترتيب</button></div>
        <ol class="rank hrank" id="tl"></ol>
        <p class="muted small">الأسانيد والمواضع بحسب روابط التخريج في برنامج الجامع بين الكتب التسعة، فالعدّ آلي تقريبي. و«المدار» الراوي الذي تلتقي عنده أكثر طرق الحديث ثم تتفرع عنه.</p>
      </div>`;

    const render = () => {
      const [label, note, col] = TURUQ_SORT[st.s] || TURUQ_SORT.c;
      const nq = norm(st.q), has = (r, b) => b && r[3].includes(PREFIX[b]);
      const rows = R.filter((r) => (!st.b || has(r, st.b)) && (!st.y || has(r, st.y)) && !(st.x && has(r, st.x)) &&
        (!st.k || r[3].length >= +st.k) && (!st.d || r[4] === st.d) && (!nq || norm(r[8]).includes(nq) || (D[r[4]] && norm(D[r[4]][0]).includes(nq))))
        .sort((a, b) => b[col] - a[col] || b[1] - a[1]);
      const shown = rows.slice(0, +st.n || 50), max = shown.length ? shown[0][col] : 1;
      const preset = TURUQ_PRESETS.find(([, p]) => Object.keys(st).every((k) => k === "n" || (p[k] || TURUQ_DEFAULT[k] || "") === st[k]));
      $("#ttitle").textContent = preset ? preset[0] : "ترتيب الأحاديث";
      for (const b of document.querySelectorAll("#tpre button")) b.classList.toggle("on", !!preset && TURUQ_PRESETS[+b.dataset.i] === preset);
      $("#tnote").innerHTML = `${fmt(rows.length)} حديثًا مطابقًا${st.d && D[st.d] ? ` مدارها <a href="#/n/${encodeURIComponent(st.d)}">${esc(D[st.d][0])}</a> (<a href="#" id="tnod">إلغاء</a>)` : ""} · مرتبة بـ${esc(label)}: ${esc(note)}`;
      const nod = $("#tnod");
      if (nod) nod.addEventListener("click", (e) => { e.preventDefault(); st.d = ""; render(); });
      $("#tl").innerHTML = shown.map((r, i) => {
        const m = D[r[4]];
        return `<li><div class="row"><span class="rk">${i + 1}</span>
          <a href="#/h/${r[0]}" class="snip">${esc(r[8])}</a><span class="num" title="${label}">${fmt(r[col])}</span>
          <span class="bar"><span style="width:${(100 * r[col]) / max}%"></span></span>
          <div class="meta-line"><a href="#/h/${r[0]}">${hkey(r[0])}</a><span>${counted(r[1], TURUQ_SORT.c[3])}</span><span>${counted(r[2], TURUQ_SORT.h[3])}</span>
            ${r[5] ? `<span>${counted(r[5], TURUQ_SORT.p[3])}</span>` : ""}
            ${m ? `<span>المدار: <a href="#/n/${encodeURIComponent(r[4])}" class="cls-${m[1]}">${esc(shortName(m[0]))}</a></span>` : ""}
            ${r[6] ? `<span title="في تخريج برنامج الجامع">${counted(r[6], TURUQ_SORT.w[3])} في ${counted(r[7], ["كتاب", "كتابين", "كتب", "كتابًا"])}</span>` : ""}
            <span class="books">${BOOKS.filter((b) => r[3].includes(PREFIX[b])).map((b) => AUTHOR[b]).join(" · ")}</span></div></div></li>`;
      }).join("") || '<li class="muted" style="padding:12px 0">لا أحاديث بهذا الاختيار</li>';
      const qs = new URLSearchParams(Object.entries(st).filter(([k, v]) => v !== (TURUQ_DEFAULT[k] || ""))).toString();
      try { history.replaceState(history.state, "", `#/turuq${qs ? "?" + qs : ""}`); } catch (_) {}
    };
    const sync = () => { for (const el of document.querySelectorAll("#tf select, #tf input")) el.value = st[el.name]; };
    let qt = 0;
    $("#tf").addEventListener("input", (e) => {
      if (!e.target.name) return;
      st[e.target.name] = e.target.value;
      clearTimeout(qt);
      qt = setTimeout(render, e.target.name === "q" ? 200 : 0);
    });
    $("#tpre").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      Object.assign(st, TURUQ_DEFAULT, { y: "", n: st.n }, TURUQ_PRESETS[+b.dataset.i][1]);
      sync(); render();
    });
    $("#treset").addEventListener("click", () => { Object.assign(st, TURUQ_DEFAULT, { y: "" }); sync(); render(); });
    $("#tcopy").addEventListener("click", async (e) => {
      try { await navigator.clipboard.writeText(location.href); e.target.textContent = "نُسخ الرابط ✓"; } catch (_) { e.target.textContent = "تعذّر النسخ"; }
      setTimeout(() => { e.target.textContent = "نسخ رابط هذا الترتيب"; }, 1800);
    });
    render();
  }

  // ---------- al-'awali: the highest chains of each book (thulathiyyat, and the Muwatta's thunaiyyat) ----------
  // data: {books: {book: {length: [[key, number label, snippet, chains...]]}}, nar}
  const LEVEL = { 2: ["الثنائيات", "ثنائي", "ثنائيًّا"], 3: ["الثلاثيات", "ثلاثي", "ثلاثيًّا"], 4: ["الرباعيات", "رباعي", "رباعيًّا"] };
  const AWALI_NOTE = {
    bukhari: "اثنان وعشرون حديثًا عند أهل العلم، وهي أعلى ما في الصحيح، وأُفردت بالتصنيف والشرح. أكثرها عن مكي بن إبراهيم وأبي عاصم النبيل عن يزيد بن أبي عبيد عن سلمة بن الأكوع، وعن محمد بن عبد الله الأنصاري عن حميد عن أنس.",
    muslim: "ليس في صحيح مسلم حديث ثلاثي، وأعلى أسانيده الرباعيات: أربعة رواة بينه وبين النبي ﷺ.",
    abudawud: "في السنن ثلاثي واحد: حديث أبي برزة في الحوض، من رواية مسلم بن إبراهيم عن عبد السلام بن أبي حازم أبي طالوت.",
    tirmidhi: "في الجامع ثلاثي واحد: حديث أنس «يأتي على الناس زمان الصابر فيهم على دينه كالقابض على الجمر»، وفي إسناده عمر بن شاكر، وهو ضعيف.",
    nasai: "ليس في سنن النسائي حديث ثلاثي، وأعلى أسانيده الرباعيات.",
    ibnmajah: "في السنن خمسة أحاديث ثلاثية، كلها من رواية جبارة بن المغلس عن كثير بن سليم عن أنس، وفي إسنادها ضعف لحال جبارة وكثير.",
    ahmad: "المسند أكثر الكتب التسعة ثلاثيات، وقد شرحها السفاريني في «نفثات صدر المكمد». العد هنا آلي ويشمل المكرر، ولا تدخل فيه زوائد ابنه عبد الله، ولا الأسانيد التي سقط منها راوٍ في المصدر.",
    muwatta: "الإمام مالك أقدم أصحاب الكتب التسعة طبقة، فأعلى أسانيده الثنائيات، مثل: مالك عن نافع عن ابن عمر. العد آلي، وقد يدخل فيه ما أرسله التابعي عن الصحابي.",
    darimi: "أكثر ثلاثيات الدارمي من رواية يزيد بن هارون عن حميد الطويل عن أنس، ومنها ما يرويه عن أبي عاصم النبيل وأبي نعيم الفضل بن دكين.",
  };
  async function viewAwali(query) {
    const A = await getJSON("data/awali.json");
    const N = A.nar;
    const st = { b: "bukhari", l: "", q: "" };
    for (const [k, v] of new URLSearchParams(query || "")) if (k in st) st[k] = v;
    if (!A.books[st.b]) st.b = "bukhari";
    const levels = (b) => Object.keys(A.books[b]).map(Number).sort();
    const top = (b) => levels(b)[0];
    const card = (b) => {
      const L = levels(b), n3 = (A.books[b][3] || []).length;
      const sub = n3 ? L[0] < 3 ? `و${fmt(A.books[b][L[0]].length)} ${LEVEL[L[0]][2]}، وهي أعلى` : "" : `لا ثلاثيات · أعلاه الرباعيات (${fmt(A.books[b][4].length)})`;
      return `<button class="panel acard" data-b="${b}"><span class="v">${n3 ? fmt(n3) : "—"}</span><span class="l">${BOOK[b]}</span><span class="s">${sub}</span></button>`;
    };
    app.innerHTML = `
      ${subnav("hadiths", "awali")}
      <div class="section-title" style="margin-top:0"><h1>الثلاثيات وعوالي الأسانيد</h1><p>الأحاديث التي ليس بين المصنف والنبي ﷺ فيها إلا ثلاثة رواة، وهي أعلى أسانيد الكتب التسعة</p></div>
      <div class="acards" id="acards">${BOOKS.map(card).join("")}</div>
      <div class="panel" style="margin-top:16px">
        <h2 id="atitle"></h2>
        <div class="seg" id="alev"></div>
        <p class="anote" id="anote"></p>
        <div id="atop"></div>
        <div class="filters" style="grid-template-columns:1fr"><label class="grow">في المتن<input id="aq" type="search" value="${esc(st.q)}" placeholder="كلمة من المتن…"></label></div>
        <p class="muted small" id="acount"></p>
        <ul class="list" id="alist"></ul>
        <p id="amore-wrap" style="text-align:center"><button class="btn" id="amore">عرض المزيد</button></p>
        <p class="muted small">العد آلي من أسانيد برنامج الجامع: يُشترط أن يكون أعلى الإسناد صحابيًّا، والذي يليه تابعيًّا أدركه، وأن يكون شيخ المصنف ممن أدرك المصنف السماع منه؛ فالأسانيد التي سقط منها راوٍ في المصدر لا تدخل. والعبرة في التحقيق بكلام أهل العلم.</p>
      </div>`;

    let shown = 0;
    const PAGE = 60;
    const rows = () => {
      const nq = norm(st.q);
      return (A.books[st.b][st.l] || []).filter((r) => !nq || norm(r[2]).includes(nq));
    };
    const item = (r) => {
      const chains = r.slice(3);
      return `<li><div class="meta-line"><a href="#/h/${r[0]}">${AUTHOR[st.b]} ${esc(r[1])}</a><span class="tag ok">${LEVEL[st.l][1]}</span>${chains.length > 1 ? `<span>${fmt(chains.length)} أسانيد</span>` : ""}<a href="#/h/${r[0]}" class="small">شجرة الإسناد ←</a></div>
        <p class="snip" style="margin:6px 0">${esc(r[2])}</p>${chains.slice(0, 3).map((c) => chainHTML(c, N, AUTHOR[st.b])).join("")}</li>`;
    };
    const more = () => {
      const R = rows();
      $("#alist").insertAdjacentHTML("beforeend", R.slice(shown, shown + PAGE).map(item).join(""));
      shown = Math.min(R.length, shown + PAGE);
      $("#amore-wrap").hidden = shown >= R.length;
      if (!R.length) $("#alist").innerHTML = '<li class="muted">لا أحاديث مطابقة</li>';
    };
    const renderList = () => {
      const R = rows(), all = (A.books[st.b][st.l] || []).length;
      $("#acount").textContent = `${fmt(all)} حديثًا ${LEVEL[st.l][2]}` + (st.q ? ` · ${fmt(R.length)} مطابقًا للبحث` : "");
      $("#alist").innerHTML = "";
      shown = 0;
      more();
      const qs = new URLSearchParams(Object.entries(st).filter(([k, v]) => v && !(k === "b" && v === "bukhari") && !(k === "l" && +v === top(st.b)))).toString();
      try { history.replaceState(history.state, "", `#/awali${qs ? "?" + qs : ""}`); } catch (_) {}
    };
    const render = () => {
      const L = levels(st.b);
      if (!L.includes(+st.l)) st.l = String(L[0]);
      for (const c of document.querySelectorAll("#acards .acard")) c.classList.toggle("on", c.dataset.b === st.b);
      $("#atitle").textContent = `${LEVEL[st.l][0]} في ${BOOK[st.b]}`;
      $("#alev").innerHTML = L.length > 1 ? L.map((l) => `<button data-l="${l}"${+st.l === l ? ' class="on"' : ""}>${LEVEL[l][0]} (${fmt(A.books[st.b][l].length)})</button>`).join("") : "";
      $("#alev").hidden = L.length < 2;
      $("#anote").textContent = AWALI_NOTE[st.b];
      // the chains that carry most of them: compiler's shaykh down to the companion
      const freq = new Map();
      for (const r of A.books[st.b][st.l]) for (const c of new Set(r.slice(3).map((c) => c.join(" ")))) freq.set(c, (freq.get(c) || 0) + 1);
      const common = [...freq].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, 5);
      $("#atop").innerHTML = common.length ? `<h3>أكثر هذه الأسانيد تكرارًا</h3><ul class="list">${common.map(([c, n]) => `<li><div class="meta-line"><span class="tag">${fmt(n)} حديثًا</span></div>${chainHTML(c.split(" "), N, AUTHOR[st.b])}</li>`).join("")}</ul>` : "";
      renderList();
    };
    $("#acards").addEventListener("click", (e) => {
      const c = e.target.closest(".acard");
      if (!c) return;
      st.b = c.dataset.b; st.l = ""; render();
      $("#atitle").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    $("#alev").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; st.l = b.dataset.l; render(); });
    let qt = 0;
    $("#aq").addEventListener("input", (e) => { st.q = e.target.value; clearTimeout(qt); qt = setTimeout(renderList, 200); });
    $("#amore").addEventListener("click", more);
    render();
  }

  async function viewExplore(query, mode) {
    const cmp = mode === "cmp";
    const X = await getJSON("data/explore.json");
    const D = META.directory;
    const st = { ...EXPLORE_DEFAULT, ...COMPARE_DEFAULT };
    for (const [k, v] of new URLSearchParams(query || "")) if (k in st) st[k] = v;
    const cityCount = new Map();
    for (const r of Object.values(X.nar)) for (const c of r[2]) cityCount.set(c, (cityCount.get(c) || 0) + 1);
    const cities = [...cityCount].filter(([, n]) => n >= 15).sort((a, b) => b[1] - a[1]);
    const opt = (v, label, cur) => `<option value="${esc(v)}"${v === cur ? " selected" : ""}>${esc(label)}</option>`;

    let bookMode = "all";
    const booksPanel = () => {
      const key = bookMode === "marfu" ? ["marfu", "marfu_uniq"] : ["hadith", "uniq"];
      const max = Math.max(...BOOKS.map((b) => X.books[b][key[0]]));
      return `<ul class="bullets">${BOOKS.map((b) => {
        const all = X.books[b][key[0]], u = X.books[b][key[1]];
        return `<li title="${BOOK[b]}: ${fmt(all)} مع المكرر، ونحو ${fmt(u)} بدون المكرر">
          <a href="#/book/${b}" class="name">${BOOK[b]}</a>
          <span class="num"><b>${fmt(u)}</b> <span class="muted">من ${fmt(all)}</span></span>
          <span class="track"><span class="all" style="width:${(100 * all) / max}%"></span><span class="u" style="width:${(100 * u) / max}%"></span></span></li>`;
      }).join("")}</ul>`;
    };

    app.innerHTML = `
      ${subnav("narrators", cmp ? "compare" : "explore")}
      <div class="section-title" style="margin-top:0">${cmp ? "<h1>مقارنة الكتب</h1><p>حضور الرواة في كتابين، وأحاديث كل كتاب بالمكرر وبدونه</p>" : "<h1>ترتيب الرواة</h1><p>اختر قائمة جاهزة أو خصّص الترتيب بالكتاب والطبقة والرتبة والبلد</p>"}</div>
      <div class="panel"${cmp ? " hidden" : ""}>
        <div class="seg xtabs" id="xtabs" role="tablist"><button role="tab" data-g="c">تخصيص</button>${PRESET_GROUPS.map(([title], g) => `<button role="tab" data-g="${g}">${title}</button>`).join("")}</div>
        <div id="xpre">${PRESET_GROUPS.map(([, re], g) => `<div class="presets" data-g="${g}" hidden>${PRESETS.map(([label], i) => (PRESET_GROUPS.find(([, r]) => r.test(label))[1] === re ? `<button class="btn" data-i="${i}">${esc(label)}</button>` : "")).join("")}</div>`).join("")}</div>
        <div class="filters" id="xf" hidden>
          <label>الكتاب<select name="b">${opt("", "الكتب التسعة", st.b)}${BOOKS.map((b) => opt(b, BOOK[b], st.b)).join("")}</select></label>
          <label>المقياس<select name="m">${Object.entries(MEASURES).map(([k, [l]]) => opt(k, l, st.m)).join("")}</select></label>
          <label>الطبقة<select name="t">${opt("", "كل الطبقات", st.t)}
            <optgroup label="مجملة">${Object.entries(TABAQA_GROUPS).map(([k, [l]]) => opt(k, l, st.t)).join("")}</optgroup>
            <optgroup label="طبقات ابن حجر">${TABAQA_NAMES.slice(2).map((l, i) => opt(`=${i + 2}`, `${i + 2}. ${l}`, st.t)).join("")}</optgroup></select></label>
          <label>الرتبة<select name="c">${opt("", "كل الرتب", st.c)}${["sahabi", "thiqa", "saduq", "maqbul", "weak", "unknown"].map((c) => opt(c, CLS_LABEL[c], st.c)).join("")}</select></label>
          <label>البلد<select name="city">${opt("", "كل البلدان", st.city)}${cities.map(([c, n]) => opt(c, `${c} (${fmt(n)})`, st.city)).join("")}</select></label>
          <label>الحال<select name="f">${opt("", "الكل", st.f)}${opt("1", "موصوف بالتدليس", st.f)}${opt("2", "اختلط أو تغيّر", st.f)}</select></label>
          <label>الرجال والنساء<select name="g">${opt("", "الكل", st.g)}${opt("m", "الرجال", st.g)}${opt("f", "النساء", st.g)}</select></label>
          <label>وله رواية في<select name="y">${opt("", "—", st.y)}${BOOKS.map((b) => opt(b, BOOK[b], st.y)).join("")}</select></label>
          <label>وليس له رواية في<select name="x">${opt("", "—", st.x)}${BOOKS.map((b) => opt(b, BOOK[b], st.x)).join("")}</select></label>
          <label>العدد<select name="n">${["10", "20", "50", "100"].map((n) => opt(n, `أول ${n}`, st.n)).join("")}</select></label>
          <label class="grow">الاسم<input name="q" type="search" value="${esc(st.q)}" placeholder="تصفية بالاسم…"></label>
        </div>

        <h2 id="xtitle">ترتيب الرواة</h2>
        <div class="xbar"><p class="muted small" id="xnote"></p>
          <button class="btn" id="xreset">إعادة الضبط</button><button class="btn" id="xcopy">نسخ رابط هذا الترتيب</button></div>
        <ol class="rank" id="xl"></ol>
      </div>

      <div class="panel"${cmp ? "" : " hidden"}><h2>مقارنة كتابين</h2>
        <div class="filters" id="cf2">
          <label>الكتاب الأول<select name="ca">${BOOKS.map((b) => opt(b, BOOK[b], st.ca)).join("")}</select></label>
          <label>الكتاب الثاني<select name="cb">${BOOKS.map((b) => opt(b, BOOK[b], st.cb)).join("")}</select></label>
          <label>طريقة العد<select name="cm">${opt("u", "بدون المكرر", st.cm)}${opt("r", "مع المكرر", st.cm)}</select></label>
          <label>الطبقة<select name="ct">${opt("", "كل الطبقات", st.ct)}${Object.entries(TABAQA_GROUPS).map(([k, [l]]) => opt(k, l, st.ct)).join("")}</select></label>
          <label>الترتيب<select name="cs">${opt("", "مجموع الكتابين", st.cs)}${opt("a", "الكتاب الأول", st.cs)}${opt("b", "الكتاب الثاني", st.cs)}</select></label>
          <label>العدد<select name="cn">${["10", "15", "30", "50"].map((n) => opt(n, `أول ${n}`, st.cn)).join("")}</select></label>
        </div>
        <div id="cmp"></div>
      </div>

      <div class="panel" style="margin-top:16px"${cmp ? "" : " hidden"}><h2>الأحاديث في كل كتاب: مع المكرر وبدونه</h2>
        <div class="tree-tools"><div class="seg" id="xbm"><button data-v="all" class="on">كل الأحاديث</button><button data-v="marfu">المرفوع فقط</button></div>
          <div class="legend"><span><i class="lg-all"></i>مع المكرر</span><span><i class="lg-u"></i>بدون المكرر (تقريبي)</span></div></div>
        <div id="xbooks">${booksPanel()}</div>
        <p class="muted small">«بدون المكرر» عدٌّ آلي يجمع الحديث الذي كرره المصنف في أكثر من موضع بحسب روابط التخريج في برنامج الجامع، فهو تقريبي: يعطي في صحيح البخاري ${fmt(X.books.bukhari.uniq)} حديثًا، وعدّها ابن حجر 2,602 حديثًا بلا تكرار. وأحاديث مسلم مرقّمة أصلًا على غير المكرر في ترقيم محمد فؤاد عبد الباقي، فالفرق فيه قليل.</p></div>`;

    const bi = (b) => BOOKS.indexOf(b);
    const value = (id) => {
      const v = D[id], r = X.nar[id];
      if (st.m === "d") return r[5];
      if (st.m === "s") return st.b ? r[4][bi(st.b)] : r[4].reduce((a, n) => a + n, 0);
      if (st.m === "u") return st.b ? v[3][bi(st.b)] : v[4];
      return st.b ? v[2][bi(st.b)] : totalOf(v);
    };
    // the same measure, book by book (madar is only counted across the nine books)
    const perBook = (id) => {
      const v = D[id], r = X.nar[id];
      return BOOKS.map((b, i) => [b, st.m === "s" ? r[4][i] : v[2][i], st.m === "s" ? r[4][i] : v[3][i]]);
    };
    const inTabaqa = (t, sel) => {
      if (!sel) return true;
      if (sel[0] === "=") return t === +sel.slice(1);
      const g = TABAQA_GROUPS[sel];
      return g && t >= g[1] && t <= g[2];
    };
    let open = null;
    const detail = (id) => {
      const v = D[id], r = X.nar[id], rows = perBook(id);
      const max = Math.max(...rows.map((x) => x[1]), 1);
      const facts = [r[0] ? `الطبقة: ${TABAQA_NAMES[r[0]]}` : "", r[1] ? `الوفاة: ${r[1]} هـ` : "", r[2].length ? `البلد: ${r[2].join("، ")}` : "",
        `الرتبة: ${CLS_LABEL[v[1]] || ""}`, r[3] & 1 ? "موصوف بالتدليس" : "", r[3] & 2 ? "اختلط أو تغيّر" : ""].filter(Boolean);
      return `<div class="xdetail"><div class="meta-line">${facts.map((f) => `<span>${esc(f)}</span>`).join("")}<a href="#/n/${encodeURIComponent(id)}">صفحة الراوي ←</a></div>
        <p class="muted small" style="margin:6px 0">${st.m === "s" ? "الأسانيد التي حدّث بها كل مصنف عنه مباشرة" : "توزيعه على الكتب: الخط الفاتح مع المكرر، والداكن بدون المكرر"}</p>
        <ul class="bullets small-b">${rows.filter((x) => x[1]).map(([b, all, u]) => `<li><span class="name">${BOOK[b]}</span>
          <span class="num"><b>${fmt(st.m === "s" ? all : u)}</b>${st.m === "s" ? "" : ` <span class="muted">من ${fmt(all)}</span>`}</span>
          <span class="track"><span class="all" style="width:${(100 * all) / max}%"></span>${st.m === "s" ? "" : `<span class="u" style="width:${(100 * u) / max}%"></span>`}</span></li>`).join("") || '<li class="muted">لا يرد في الكتب التسعة بهذا المقياس</li>'}</ul></div>`;
    };
    const render = () => {
      const nq = norm(st.q);
      const rows = Object.keys(D).filter((id) => {
        const v = D[id], r = X.nar[id];
        return r && (!st.c || v[1] === st.c) && inTabaqa(r[0], st.t) && (!st.city || r[2].includes(st.city)) && (!st.f || r[3] & +st.f) &&
          (!st.g || !(r[3] & 4) === (st.g === "m")) && (!st.y || v[2][bi(st.y)] > 0) && (!st.x || !v[2][bi(st.x)]) &&
          (!nq || norm(v[0]).includes(nq)) && !/^\[/.test(v[0]);
      }).map((id) => [id, value(id)]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
      const shown = rows.slice(0, +st.n || 20);
      const max = shown.length ? shown[0][1] : 1;
      const [mLabel, mNote] = MEASURES[st.m];
      const preset = PRESETS.find(([, p]) => Object.keys(EXPLORE_DEFAULT).every((k) => k === "n" || (p[k] || EXPLORE_DEFAULT[k]) === st[k]));
      $("#xtitle").textContent = preset ? preset[0] : "ترتيب الرواة";
      for (const b of document.querySelectorAll("#xpre button")) {
        const on = !!preset && PRESETS[+b.dataset.i] === preset;
        b.classList.toggle("on", on);
        if (on) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current");
      }
      $("#xnote").textContent = `${fmt(rows.length)} راويًا مطابقًا · ${mLabel}${st.m === "d" ? " في الكتب التسعة مجتمعة" : st.b ? ` في ${BOOK[st.b]}` : " في الكتب التسعة"}: ${mNote}`;
      $("#xl").innerHTML = shown.map(([id, n], i) => {
        const v = D[id];
        return `<li data-id="${esc(id)}" class="${open === id ? "open" : ""}"><button class="row" aria-expanded="${open === id}" title="${esc(v[0])}: ${fmt(n)}">
          <span class="rk">${i + 1}</span><span class="name cls-${v[1]}"><span class="dot"></span>${esc(v[0])}</span><span class="num">${fmt(n)}</span>
          <span class="bar"><span style="width:${(100 * n) / max}%"></span></span></button>${open === id ? detail(id) : ""}</li>`;
      }).join("") || '<li class="muted" style="padding:12px 0">لا رواة بهذا الاختيار</li>';
      saveState();
    };
    const saveState = () => {
      const both = { ...EXPLORE_DEFAULT, ...COMPARE_DEFAULT };
      const qs = new URLSearchParams(Object.entries(st).filter(([k, v]) => v !== both[k])).toString();
      try { history.replaceState(history.state, "", `#/${cmp ? "compare" : "explore"}${qs ? "?" + qs : ""}`); } catch (_) {}
    };
    const sync = () => { for (const el of document.querySelectorAll("#xf select, #xf input")) el.value = st[el.name]; };
    // tabs above the ranking: one per preset group, and the custom filters
    const showTab = (g) => {
      for (const t of document.querySelectorAll("#xtabs button")) { const on = t.dataset.g === String(g); t.classList.toggle("on", on); t.setAttribute("aria-selected", on); }
      for (const d of document.querySelectorAll("#xpre .presets")) d.hidden = d.dataset.g !== String(g);
      $("#xf").hidden = g !== "c";
    };
    // apply a ranking (from a preset or a comparison figure); scroll only when its title is out of view
    const applyRanking = (p) => {
      // the comparison page shows its figures' rankings on the ranking page
      if (cmp) { location.hash = `#/explore?${new URLSearchParams(Object.entries(p).filter(([, v]) => v))}`; return; }
      Object.assign(st, EXPLORE_DEFAULT, { n: st.n }, p);
      open = null; sync(); render();
      const top = $("#xtitle").getBoundingClientRect().top;
      if (top < 60 || top > innerHeight * 0.6) $("#xtitle").scrollIntoView({ behavior: "smooth", block: "start" });
    };

    // ----- two books side by side -----
    const compare = () => {
      const A = st.ca, B = st.cb, ia = bi(A), ib = bi(B), uq = st.cm === "u";
      const val = (id, i) => (uq ? D[id][3][i] : D[id][2][i]);
      const ids = Object.keys(D).filter((id) => X.nar[id] && !/^\[/.test(D[id][0]) && inTabaqa(X.nar[id][0], st.ct));
      const inA = ids.filter((id) => D[id][2][ia] > 0), inB = ids.filter((id) => D[id][2][ib] > 0);
      const shared = inA.filter((id) => D[id][2][ib] > 0).length;
      const key = st.cs === "a" ? (id) => val(id, ia) : st.cs === "b" ? (id) => val(id, ib) : (id) => val(id, ia) + val(id, ib);
      const rows = ids.filter((id) => key(id) > 0).sort((p, q) => key(q) - key(p)).slice(0, +st.cn || 15);
      const max = Math.max(1, ...rows.map((id) => Math.max(val(id, ia), val(id, ib))));
      const bk = (b, cls) => {
        const h = X.books[b];
        return `<div class="ctile ${cls}"><div class="l"><i></i>${BOOK[b]}</div><div class="v">${fmt(h.uniq)}</div>
          <div class="s">حديثًا بدون المكرر (تقريبًا) من ${fmt(h.hadith)}</div></div>`;
      };
      const tabLabel = st.ct ? (TABAQA_GROUPS[st.ct] || [""])[0] : "";
      const fig = (n, label, p) => `<button class="ctile link" data-p='${esc(JSON.stringify(p))}'><div class="v">${fmt(n)}</div><div class="l">${label}</div></button>`;
      const tp = st.ct ? { t: st.ct } : {};
      $("#cmp").innerHTML = A === B ? '<p class="notice">اختر كتابين مختلفين للمقارنة.</p>' : `
        <div class="ctiles">${bk(A, "sa")}${bk(B, "sb")}
          ${fig(shared, `${tabLabel ? tabLabel + " " : "راويًا "}مشتركًا بينهما`, { b: A, y: B, m: st.cm, ...tp })}
          ${fig(inA.length - shared, `انفرد بهم ${AUTHOR[A]}`, { b: A, x: B, m: st.cm, ...tp })}
          ${fig(inB.length - shared, `انفرد بهم ${AUTHOR[B]}`, { b: B, x: A, m: st.cm, ...tp })}</div>
        <p class="muted small">الأعداد الثلاثة الأخيرة للرواة${tabLabel ? ` (${tabLabel})` : ""}، واضغط على أيٍّ منها لعرض أسمائهم مرتبين.</p>
        <div class="legend"><span><i class="sw sa"></i>${BOOK[A]}</span><span><i class="sw sb"></i>${BOOK[B]}</span></div>
        <ol class="pair">${rows.map((id, i) => {
          const a = val(id, ia), b = val(id, ib), v = D[id];
          return `<li title="${esc(v[0])}: ${AUTHOR[A]} ${fmt(a)} · ${AUTHOR[B]} ${fmt(b)}"><span class="rk">${i + 1}</span>
            <a class="name cls-${v[1]}" href="#/n/${encodeURIComponent(id)}"><span class="dot"></span>${esc(shortName(v[0]))}</a>
            <span class="pb sa"><span style="width:${(100 * a) / max}%"></span><b>${fmt(a)}</b></span>
            <span class="pb sb"><span style="width:${(100 * b) / max}%"></span><b>${fmt(b)}</b></span></li>`;
        }).join("")}</ol>`;
    };
    $("#cf2").addEventListener("input", (e) => { if (!e.target.name) return; st[e.target.name] = e.target.value; compare(); saveState(); });
    $("#cmp").addEventListener("click", (e) => { const t = e.target.closest("button.link"); if (t) applyRanking(JSON.parse(t.dataset.p)); });
    compare();
    render();

    $("#xbm").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; setSeg("#xbm", b); bookMode = b.dataset.v; $("#xbooks").innerHTML = booksPanel(); });
    $("#xf").addEventListener("input", (e) => { if (!e.target.name) return; st[e.target.name] = e.target.value; open = null; render(); });
    $("#xpre").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) applyRanking(PRESETS[+b.dataset.i][1]); });
    $("#xtabs").addEventListener("click", (e) => { const t = e.target.closest("button"); if (t) showTab(t.dataset.g === "c" ? "c" : +t.dataset.g); });
    // start on the custom filters, or on the current preset's group when the link is a preset
    const cur = document.querySelector("#xpre button.on");
    showTab(cur ? +cur.parentElement.dataset.g : "c");
    $("#xreset").addEventListener("click", () => { Object.assign(st, EXPLORE_DEFAULT); open = null; sync(); render(); });
    $("#xcopy").addEventListener("click", async (e) => {
      try { await navigator.clipboard.writeText(location.href); e.target.textContent = "نُسخ الرابط ✓"; } catch (_) { e.target.textContent = "تعذّر النسخ"; }
      setTimeout(() => { e.target.textContent = "نسخ رابط هذا الترتيب"; }, 1800);
    });
    $("#xl").addEventListener("click", (e) => {
      const row = e.target.closest("button.row");
      if (!row) return;
      const id = row.parentElement.dataset.id;
      open = open === id ? null : id;
      render();
    });
  }

  // ---------- search ----------
  // Matching runs on a folded copy of each text that keeps one char per char, so match offsets
  // point straight back into the displayed (original) spelling.
  const L = "ء-ي";
  const FOLD = { "آ": "ا", "أ": "ا", "إ": "ا", "ٱ": "ا", "ؤ": "و", "ئ": "ي", "ى": "ي", "ة": "ه", "ک": "ك", "ی": "ي" };
  const fold = (s) => s.replace(/[آأإؤئةى]|[^ء-ي]/g, (c) => FOLD[c] || " ");
  const plain = (s) => String(s || "").replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ‌-‏]/g, "");
  let CORPUS = null;
  const corpus = () => (CORPUS ||= searchIndex().then((idx) => idx.map((r, i) => {
    const bab = plain(r[3]);
    return { r, i, f: fold(r[2]), bab, bf: fold(bab) };
  })));

  // one query word -> regex source: whole word, tolerant of the clitics و ف ب ك ل and the article;
  // short words must match exactly (so «الى» does not hit «اليمن»), longer ones or «word*» may continue.
  function termSource(w) {
    const star = /\*$/.test(w);
    w = fold(norm(w)).replace(/ /g, "");
    if (!w) return null;
    let core;
    if (w === "ابن") core = "ا?بن";
    else if (w.startsWith("ال") && w.length > 3) core = `(?:[بك]?ال|لل)${w.slice(2)}`;
    else core = `[بكل]?(?:ال)?${w}`;
    return `(?<![${L}])[وف]?${core}${star || w.length >= 4 ? `[${L}]*` : `(?![${L}])`}`;
  }
  function parseQuery(q) {
    const req = [], neg = [], words = [];
    let phrased = false;
    for (const m of q.replace(/[«»“”]/g, '"').matchAll(/(-?)"([^"]*)"?|(-?)(\S+)/g)) {
      const isPhrase = m[2] != null, minus = isPhrase ? m[1] : m[3];
      const parts = (isPhrase ? m[2] : m[4]).split(/\s+/).map(termSource).filter(Boolean);
      if (!parts.length) continue;
      const re = new RegExp(parts.join(`[^${L}]+`), "g");
      if (minus) { neg.push(re); continue; }
      req.push(re);
      if (isPhrase) phrased = true; else words.push(parts[0]);
    }
    // several loose words: the same words side by side rank first
    const whole = !phrased && words.length > 1 ? new RegExp(words.join(`[^${L}]+`), "g") : null;
    return { req, neg, whole };
  }
  function spansOf(re, s) {
    const out = [];
    re.lastIndex = 0;
    for (let m; (m = re.exec(s));) { out.push([m.index, m.index + m[0].length]); if (!m[0]) re.lastIndex++; }
    return out;
  }
  const inRanges = (R, i) => { for (let j = 0; j < R.length; j += 2) if (i >= R[j] && i < R[j + 1]) return true; return false; };
  // scope: all (text or bab) | matn | isnad (text outside the matn) | bab
  function matchRecord(rec, Q, scope) {
    const R = rec.r[5], isMatn = (i) => !R.length || inRanges(R, i);
    const keep = (sp) => (scope === "matn" ? sp.filter(([a]) => isMatn(a)) : scope === "isnad" ? sp.filter(([a]) => !isMatn(a)) : sp);
    const spans = [], babSpans = [];
    for (const re of Q.req) {
      const t = scope === "bab" ? [] : keep(spansOf(re, rec.f));
      const b = scope === "bab" || scope === "all" ? spansOf(re, rec.bf) : [];
      if (!t.length && !b.length) return null;
      spans.push(...t); babSpans.push(...b);
    }
    for (const re of Q.neg) {
      if ((scope !== "bab" && keep(spansOf(re, rec.f)).length) || ((scope === "bab" || scope === "all") && spansOf(re, rec.bf).length)) return null;
    }
    // relevance: the exact phrase, matches in the matn, words close together, a matching bab, shorter texts
    let score = 0, marks = spans;
    if (Q.whole) {
      const w = keep(spansOf(Q.whole, rec.f));
      // when the phrase is there, mark only it rather than every «عن» and «في» in the text
      if (w.length) { score += w.some(([a]) => isMatn(a)) ? 100 : 60; marks = w; }
    }
    if (spans.length) {
      if (spans.every(([a]) => isMatn(a))) score += 20;
      const starts = spans.map(([a]) => a);
      score += 30 * Math.max(0, 1 - (Math.max(...starts) - Math.min(...starts)) / 400);
    }
    if (babSpans.length) score += 10;
    score += 5 * Math.max(0, 1 - rec.r[2].length / 3000) + (SAHIHAYN.has(bookOf(rec.r[0])) ? 4 : 0);
    return { rec, score, spans: marks, babSpans };
  }
  function merge(sp) {
    const out = [];
    for (const [a, b] of [...sp].sort((x, y) => x[0] - y[0])) {
      if (out.length && a <= out[out.length - 1][1]) out[out.length - 1][1] = Math.max(out[out.length - 1][1], b);
      else out.push([a, b]);
    }
    return out;
  }
  function markText(t, spans, a = 0, b = t.length, R = null) {
    const cuts = new Set([a, b]);
    const sp = merge(spans).filter(([x, y]) => y > a && x < b);
    for (const [x, y] of sp) { cuts.add(Math.max(a, x)); cuts.add(Math.min(b, y)); }
    if (R && R.length) for (const x of R) if (x > a && x < b) cuts.add(x);
    const pts = [...cuts].sort((x, y) => x - y);
    let html = "";
    for (let i = 0; i < pts.length - 1; i++) {
      const s = pts[i], e = pts[i + 1];
      let h = esc(t.slice(s, e));
      if (sp.some(([x, y]) => s >= x && s < y)) h = `<mark>${h}</mark>`;
      if (R && R.length && !inRanges(R, s)) h = `<span class="isn">${h}</span>`;
      html += h;
    }
    return html;
  }
  // a window of the text around the best match (preferring the matn), isnad shown muted
  function snippet(hit, width = 320) {
    const t = hit.rec.r[2], R = hit.rec.r[5];
    const sp = [...hit.spans].sort((x, y) => x[0] - y[0]);
    const first = sp.find(([x]) => !R.length || inRanges(R, x)) || sp[0];
    const focus = first ? first[0] : R[0] || 0;
    let a = Math.max(0, focus - 90), b = Math.min(t.length, a + width);
    a = Math.max(0, Math.min(a, b - width));
    if (a > 0) { const s = t.indexOf(" ", a); if (s > -1 && s < focus) a = s + 1; }
    if (b < t.length) { const s = t.lastIndexOf(" ", b); if (s > focus) b = s; }
    return (a > 0 ? "… " : "") + markText(t, sp, a, b, R) + (b < t.length ? " …" : "");
  }
  // «البخاري 1524», «مسلم ١٥», or a bare number
  function numberLookup(q) {
    const m = q.replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 1632).trim().match(/^(.*?)\s*(\d+)$/);
    if (!m) return [];
    const name = norm(m[1]);
    const books = BOOKS.filter((b) => !name || [AUTHOR[b], BOOK[b]].some((x) => { const n = norm(x); return n === name || n.replace(/^ال/, "") === name || n.endsWith(" " + name); }));
    return name && books.length === 0 ? [] : books.map((b) => PREFIX[b] + m[2]).filter((k) => META.index[k]);
  }

  async function viewSearch(path) {
    const pm = path.match(/^(.*?)\?((?:[a-z]=\w*&?)+)$/);
    const q = (pm ? pm[1] : path).trim();
    const opt = { b: "", s: "all", o: "rel", g: "", h: "", ...Object.fromEntries(new URLSearchParams(pm ? pm[2] : "")) };
    $("#q").value = q;
    if (!q) { location.hash = "#/"; return; }
    track("search", q);
    const lookup = numberLookup(q);
    // a named book with a number goes straight to that hadith (replacing this page in history)
    if (lookup.length === 1 && !/^\s*[\d٠-٩]+\s*$/.test(q)) { location.replace("#/h/" + lookup[0]); return; }
    // «البخاري 1524» is a lookup, not a text search
    const Q = lookup.length ? { req: [] } : parseQuery(q);
    const words = norm(q.replace(/(^|\s)-\S+/g, " ")).split(" ").filter((w) => w.length > 1);
    const narrators = words.length && !lookup.length ? Object.entries(META.directory).filter(([, v]) => words.every((w) => norm(v[0]).includes(w)))
      .sort((a, b) => totalOf(b[1]) - totalOf(a[1])).slice(0, 12) : [];
    const recs = Q.req.length ? await corpus() : [];
    const byScope = {};
    const hitsFor = (s) => (byScope[s] ||= recs.map((r) => matchRecord(r, Q, s)).filter(Boolean));

    const SCOPES = [["all", "الكل"], ["matn", "المتن"], ["isnad", "الإسناد"], ["bab", "التبويب"]];
    const SORTS = [["rel", "الأكثر صلة"], ["book", "ترتيب الكتب"]];
    // grade class per record (built from the quoted verdicts): s accepted, w weak, m the sources differ, "" none
    const GRADE_F = [["", "الكل"], ["s", "الصحيح وما في حكمه"], ["w", "الضعيف"], ["m", "مختلف فيه"], ["n", "بلا حكم"]];
    const gradeOf = (h) => h.rec.r[6] || "n";
    // a tag on each result outside the Sahihayn (whose book already says it)
    const GRADE_TAG = { s: ["صحيح أو حسن", "thiqa"], w: ["ضعيف", "weak"], m: ["مختلف فيه", "maqbul"] };
    const gradeTag = (h) => {
      const t = !SAHIHAYN.has(bookOf(h.rec.r[0])) && GRADE_TAG[h.rec.r[6]];
      return t ? `<a class="s-gr cls-${t[1]}" href="#/h/${h.rec.r[0]}" title="تصنيف آلي لأحكام المحدثين، ونصها في صفحة الحديث">${t[0]}</a>` : "";
    };
    app.innerHTML = `<h1>نتائج البحث: «${esc(q)}»</h1>
      ${lookup.length ? `<div class="panel lookup"><span class="muted">انتقل إلى الحديث برقمه:</span> ${lookup.map((k) => `<a class="btn" href="#/h/${k}">${BOOK[bookOf(k)]} ${hnum(k)}</a>`).join(" ")}</div>` : ""}
      ${narrators.length ? `<div class="panel" style="margin-bottom:16px"><h2>رواة</h2><div class="chain">${narrators.map(([id, v]) => `<a class="chip cls-${v[1]}" href="#/n/${encodeURIComponent(id)}"><span class="dot"></span>${esc(v[0])}</a>`).join(" ")}</div></div>` : ""}
      ${Q.req.length ? `<div class="panel">
        <div class="s-tools">
          <div class="s-row"><span class="s-lbl">البحث في</span><div class="seg" id="sScope">${SCOPES.map(([v, l]) => `<button data-v="${v}" class="${opt.s === v ? "on" : ""}">${l}</button>`).join("")}</div></div>
          <div class="s-row"><span class="s-lbl">الترتيب</span><div class="seg" id="sSort">${SORTS.map(([v, l]) => `<button data-v="${v}" class="${opt.o === v ? "on" : ""}">${l}</button>`).join("")}</div>
            <label class="s-check"><input type="checkbox" id="sGroup" ${opt.g ? "checked" : ""}> ضمّ روايات الحديث الواحد</label></div>
          <div class="s-row"><span class="s-lbl">الحكم</span><div class="seg" id="sGrade"></div></div>
          <div class="s-books" id="sBooks"></div>
        </div>
        <details class="s-help"><summary>طريقة البحث</summary>
          <ul>
            <li>تُطابَق الكلمة كاملة مع ما يتصل بها من الواو والفاء والباء واللام وأداة التعريف، ولا يُلتفت إلى التشكيل ولا إلى الهمزات والتاء المربوطة والألف المقصورة.</li>
            <li>عبارة متصلة: ضعها بين علامتي تنصيص <code>"العمرة إلى العمرة"</code> أو <code>«العمرة إلى العمرة»</code>.</li>
            <li>استبعاد كلمة: ضع قبلها علامة الطرح <code>الصلاة -الجمعة</code>.</li>
            <li>بداية كلمة: أضف نجمة <code>صلا*</code> لتشمل صلاة وصلاته وصلاتكم.</li>
            <li>رقم الحديث: <code>البخاري 1524</code> أو <code>مسلم 15</code>.</li>
            <li>تصفية بالحكم: «الصحيح وما في حكمه» أحاديث الصحيحين، وما حكم عليه المحدثون المنقولة أحكامهم في صفحة كل حديث بالصحة أو الحسن (ومنه الصحيح والحسن لغيره، و«حديث صحيح وهذا إسناد ضعيف»، و«إسناده صحيح»). و«مختلف فيه» ما صحّحه بعضهم وضعّفه غيره، و«بلا حكم» أحاديث الموطأ وما لم يُنقل فيه حكم. التصنيف آلي مأخوذ من ألفاظ الأحكام، فالمرجع نص الحكم في صفحة الحديث.</li>
          </ul>
        </details>
        <div id="sOut"></div>
      </div>` : lookup.length ? "" : '<div class="panel muted">اكتب كلمة من متن الحديث أو اسم راوٍ.</div>'}`;
    if (!Q.req.length) return;

    let shown = 30;
    const render = () => {
      history.replaceState(null, "", "#/search/" + encodeURIComponent(q) + (() => {
        const p = new URLSearchParams(Object.entries(opt).filter(([k, v]) => v && !(k === "s" && v === "all") && !(k === "o" && v === "rel")));
        return p.toString() ? "?" + p : "";
      })());
      const scoped = hitsFor(opt.s);
      const perGrade = { "": scoped.length, s: 0, w: 0, m: 0, n: 0 };
      for (const h of scoped) perGrade[gradeOf(h)]++;
      $("#sGrade").innerHTML = GRADE_F.map(([v, l]) => `<button data-v="${v}" class="${opt.h === v ? "on" : ""}" ${perGrade[v] || opt.h === v ? "" : "disabled"}>${l} <small>${fmt(perGrade[v])}</small></button>`).join("");
      const all = opt.h ? scoped.filter((h) => gradeOf(h) === opt.h) : scoped;
      const per = Object.fromEntries(BOOKS.map((b) => [b, 0]));
      for (const h of all) per[bookOf(h.rec.r[0])]++;
      $("#sBooks").innerHTML = `<button data-v="" class="fchip ${opt.b ? "" : "on"}">الكتب التسعة <b>${fmt(all.length)}</b></button>` +
        BOOKS.map((b) => `<button data-v="${b}" class="fchip ${opt.b === b ? "on" : ""}" ${per[b] ? "" : "disabled"}>${AUTHOR[b]} <b>${fmt(per[b])}</b></button>`).join("");
      let list = opt.b ? all.filter((h) => bookOf(h.rec.r[0]) === opt.b) : all.slice();
      list.sort(opt.o === "book" ? (x, y) => x.rec.i - y.rec.i : (x, y) => y.score - x.score || x.rec.i - y.rec.i);
      const groups = new Set(list.map((h) => h.rec.r[1])).size;
      const others = new Map();
      if (opt.g) {
        const seen = new Map();
        list = list.filter((h) => {
          const g = h.rec.r[1];
          if (!seen.has(g)) { seen.set(g, h); others.set(h, []); return true; }
          others.get(seen.get(g)).push(h.rec.r[0]);
          return false;
        });
      }
      const page = list.slice(0, shown);
      const scopeTip = (opt.s !== "all" ? ` <button class="linkish" data-scope="all">ابحث في الكل</button>` : "") +
        (opt.h ? ` <button class="linkish" data-grade="">اعرض كل الأحكام</button>` : "");
      $("#sOut").innerHTML = `<p class="s-count">${opt.g ? `الأحاديث: ${fmt(groups)}` : `النتائج: ${fmt(list.length)}${groups !== list.length ? ` <span class="muted">· ترجع إلى ${fmt(groups)} حديثًا</span>` : ""}`}</p>
        <ul class="list s-list">${page.map((h) => {
          const k = h.rec.r[0], more = others.get(h) || [];
          const bab = h.rec.bab ? `<span class="s-bab">${markText(h.rec.bab, h.babSpans)}</span>` : "";
          return `<li><div class="meta-line"><a class="s-ref" href="#/h/${k}">${hkey(k)}</a>${gradeTag(h)}${bab}</div>
            <a class="snip s-snip" href="#/h/${k}">${h.spans.length ? snippet(h) : markText(clip(h.rec.r[2], 260), [])}</a>
            ${more.length ? `<div class="s-more">وفي النتائج أيضًا: ${more.slice(0, 8).map((x) => `<a href="#/h/${x}">${hkey(x)}</a>`).join(" · ")}${more.length > 8 ? ` <span class="muted">و${fmt(more.length - 8)} غيرها</span>` : ""}</div>` : ""}</li>`;
        }).join("") || `<li class="muted">لا نتائج.${scopeTip} جرّب كلمات أقل أو صيغة أخرى، أو <a href="https://dorar.net/hadith/search?q=${encodeURIComponent(q)}&st=w" target="_blank" rel="noopener">ابحث في الموسوعة الحديثية</a>.</li>`}</ul>
        ${list.length > shown ? `<div class="pager"><button class="btn" id="sMore">عرض المزيد (${fmt(list.length - shown)} باقية)</button></div>` : ""}`;
      $("#sMore")?.addEventListener("click", () => { const y = scrollY; shown += 30; render(); scrollTo(0, y); });
      $("#sOut [data-grade]")?.addEventListener("click", () => { opt.h = ""; shown = 30; render(); });
      $("#sOut [data-scope]")?.addEventListener("click", () => { opt.s = "all"; setSeg("#sScope", $('#sScope [data-v="all"]')); shown = 30; render(); });
    };
    const bind = (sel, key) => $(sel).addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b || b.disabled) return;
      opt[key] = b.dataset.v;
      if (sel !== "#sBooks") setSeg(sel, b);
      shown = 30;
      render();
    });
    bind("#sScope", "s"); bind("#sSort", "o"); bind("#sBooks", "b"); bind("#sGrade", "h");
    $("#sGroup").addEventListener("change", (e) => { opt.g = e.target.checked ? "1" : ""; shown = 30; render(); });
    render();
  }

  $("#searchForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = $("#q").value.trim();
    if (q) go("#/search/" + encodeURIComponent(q));
  });

  // ---------- about ----------
  // a narrator who lowers a chain's grade: link to those chains in the book where he appears most
  const CHAIN_OF_CLS = { saduq: "saduq", maqbul: "mutakallam", weak: "mutakallam", unknown: "unknown" };
  function chainsOf(id) {
    const v = META.directory[id], c = v && CHAIN_OF_CLS[v[1]];
    if (!c) return "";
    const i = v[2].indexOf(Math.max(...v[2]));
    return `<a class="pill" href="#/chains?b=${BOOKS[i]}&c=${c}&n=${encodeURIComponent(id)}">الأسانيد التي وُصفت به ←</a>`;
  }

  async function viewIsnads() {
    const S = await stats();
    app.innerHTML = `
      ${subnav("isnads", "isnads")}
      <div class="section-title" style="margin-top:0"><h1>أشهر الأسانيد وأطوالها</h1><p>السلاسل الأكثر تكرارًا في الكتب التسعة، وعدد الرواة بين المصنف والنبي ﷺ في كل كتاب</p></div>
      <div class="grid g2">
        <div class="panel"><h2>أشهر الأسانيد</h2><p class="muted small">أكثر السلاسل تكرارًا: الصحابي واثنان دونه</p>
          <ul class="list">${S.top_isnads.map(([c, v]) => `<li><div class="meta-line"><span class="tag">${fmt(v)} إسنادًا</span></div>${chainHTML(c, S.nar)}</li>`).join("")}</ul></div>
        <div class="panel"><h2>طول الإسناد</h2><p class="muted small">عدد الأسانيد بحسب عدد الرواة بين المصنف والنبي ﷺ</p>
          ${BOOKS.map((b) => `<h3 class="muted">${BOOK[b]}</h3>${hist(S.chain_length[b].filter(([l]) => l >= 2 && l <= 10).map(([l, v]) => [String(l), v, `${l} رواة`, l <= 4 ? `#/awali?b=${b}` : ""]), 80)}`).join("")}
          <p class="muted small">الأعمدة القصيرة (ثلاثة رواة أو أربعة) تفتح صفحة الثلاثيات وعوالي الأسانيد.</p></div>
      </div>`;
  }

  function viewTools() {
    app.innerHTML = `<div class="section-title" style="margin-top:0"><h1>أدوات الباحث</h1><p>ما يمكن أن تسأل عنه في «نور السنة»، وأين تجده</p></div>${toolsHTML()}`;
  }

  async function viewAbout() {
    app.innerHTML = `<div class="panel" style="max-width:820px">
      <h1>عن المشروع</h1>
      <p><a class="btn gold" href="#/tools">أدوات الباحث في الموقع ←</a></p>
      <p>«نور السنة» أداة مفتوحة لدراسة أسانيد الكتب التسعة: تعرض لكل حديث شجرة رواته وطرقه فيها، وتُظهر مدار الحديث ومتابعاته وشواهده وتخريجه في كتب السنة، وتربط كل راوٍ بترجمته ورتبته عند ابن حجر والذهبي.</p>
      <h2>منهج العرض</h2>
      <ul>
        <li>أحاديث الصحيحين صحيحة بحكم الشيخين وتلقي الأمة لهما بالقبول. ووصف رجال كل إسناد بحسب رتبهم عند ابن حجر بيانٌ لحال الرجال، لا حكمٌ على الحديث.</li>
        <li>رواية الشيخين عمن تُكلِّم فيه تكون غالبًا في المتابعات والشواهد، أو مما انتقياه من صحيح حديثه.</li>
        <li>«المدار» يُحسب آليًا: هو الراوي الذي تتفرع عنه أكثر الطرق داخل الكتب التسعة.</li>
        <li>جمع روايات الحديث الواحد في الكتب التسعة قائم على تخريج برنامج جامع خادم الحرمين الشريفين.</li>
        <li>أحاديث السنن فيها الصحيح والحسن والضعيف، ويُعرض حكم الترمذي بلفظه حيث ورد، وتُربط كل الأحاديث بأحكام المحدثين في الدرر السنية.</li>
        <li>أحكام المحدثين المعروضة في صفحة الحديث تُنقل بنصها منسوبةً إلى أصحابها ولا نرجّح بينها: حكم الألباني على أحاديث سنن أبي داود والترمذي وابن ماجه (من كتبه «صحيح وضعيف السنن» كما نقلتها المكتبة الشاملة) وسنن النسائي (من «صحيح سنن النسائي» و«ضعيف سنن النسائي»)، وحكم محققي طبعة الرسالة العالمية لسنن النسائي، وحكم شعيب الأرناؤوط ومحققي طبعة مؤسسة الرسالة لمسند أحمد، وكلام البوصيري في «مصباح الزجاجة» على زوائد ابن ماجه بنقل محمد فؤاد عبد الباقي، وحكم حسين سليم أسد في تحقيقه لمسند الدارمي.</li>
        <li>الشرح الميسّر في صفحة الحديث منقول بنصه من «موسوعة الأحاديث النبوية»، وهو شرح مختصر لعموم القرّاء مع فوائد الحديث ومعاني كلماته وترجماته إلى لغات المسلمين. ويُربط شرح الموسوعة بكل رواية في الكتب التسعة يوافق لفظها لفظ الحديث في الموسوعة، فقد يختلف اللفظان يسيرًا. فإن لم يكن للرواية شرح، وكان في الموسوعة حديث قريب من لفظها، عُرض شرحه بعنوان «شرح حديث مشابه» مع نصه للمقارنة.</li>
        <li>الترقيم: البخاري على «فتح الباري»، ومسلم وابن ماجه على ترقيم محمد فؤاد عبد الباقي، وأبو داود على ترقيم محمد محيي الدين عبد الحميد، والترمذي على ترقيم أحمد شاكر، والنسائي على ترقيم برنامج الجامع.</li>
        <li>فهرس الكتب الكبرى للسنن الأربع من <a href="https://shamela.ws/" target="_blank" rel="noopener">المكتبة الشاملة</a>.</li>
      </ul>
      <h2>مصادر البيانات</h2>
      <p>نصوص الأحاديث وأسانيدها، وتراجم الرواة ورتبهم، والتخريج والشواهد: من <a href="https://sunna.alifta.gov.sa/" target="_blank" rel="noopener">برنامج جامع خادم الحرمين الشريفين للسنة النبوية</a> (الرئاسة العامة للبحوث العلمية والإفتاء)، عن النسخة المهيكلة التي نشرها الباحث جهاد عمر (<a href="https://github.com/JehadOumer/Ifta-Sunnah-Hadith-and-Narrators-Dataset" target="_blank" rel="noopener">Ifta Sunnah Hadith &amp; Narrators Dataset</a>).</p>
      <p>أحكام المحدثين على الأحاديث: من طبعات <a href="https://shamela.ws/" target="_blank" rel="noopener">المكتبة الشاملة</a> المحققة (سنن أبي داود ت محيي الدين عبد الحميد، وسنن الترمذي ت شاكر، وسنن ابن ماجه ت عبد الباقي، و«صحيح سنن النسائي» و«ضعيف سنن النسائي» للألباني، وسنن النسائي ط الرسالة العالمية، ومسند أحمد ط مؤسسة الرسالة، ومسند الدارمي ت حسين سليم أسد)، مع روابط إلى <a href="https://dorar.net/hadith" target="_blank" rel="noopener">الموسوعة الحديثية في موقع الدرر السنية</a> تُفتح في موقعهم.</p>
      <p>الشرح الميسّر وترجماته: من <a href="https://hadeethenc.com/" target="_blank" rel="noopener">موسوعة الأحاديث النبوية</a> (إعداد مركز الترجمة بالمكتب التعاوني للدعوة وتوعية الجاليات بالربوة)، عن واجهتها البرمجية المفتوحة، مع رابط كل حديث في موقعها.</p>
      <p class="muted small">الحقوق العلمية محفوظة لأصحابها: برنامج الجامع للرئاسة العامة للبحوث العلمية والإفتاء، والموسوعة الحديثية للدرر السنية، وموسوعة الأحاديث النبوية لمعدّيها. والموقع مستقل ولا يمثل أيًّا منهم.</p>
      <h2>التواصل</h2>
      <p>للاقتراحات أو الإبلاغ عن خطأ في حديث أو راوٍ أو إسناد، راسلنا على: <a href="${mailto("نور السنة: اقتراح أو ملاحظة")}">${CONTACT}</a></p>
      <p class="notice">هذه نسخة أولية للتجربة والمراجعة، ونرحب بالتنبيه على أي خطأ.</p>
    </div>`;
  }

  // ---------- theme ----------
  try { const t = localStorage.getItem("theme"); if (t) document.documentElement.dataset.theme = t; } catch (_) {}
  $("#themeBtn").addEventListener("click", () => {
    const dark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === "dark"
      : matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("theme", document.documentElement.dataset.theme); } catch (_) {}
    route();
  });

  route();
})();
