/* نور السنة — static single-page app (no build step). */
(() => {
  "use strict";

  // ---------- config ----------
  // When the site is deployed, point this at a tiny counter endpoint (Cloudflare Worker,
  // Firebase function, ...) to collect "most viewed / most searched" indicators.
  // It receives POST {type: "view"|"search", key} and GET returns {views: [[key,n]], searches: [[q,n]]}.
  const ANALYTICS_ENDPOINT = window.ANALYTICS_ENDPOINT || null;
  const PAGE = 40;
  const CONTACT = "zuhair.nammous@gmail.com";
  const mailto = (subject) => `mailto:${CONTACT}?subject=${encodeURIComponent(subject)}`;

  const BOOKS = ["bukhari", "muslim", "abudawud", "tirmidhi", "nasai", "ibnmajah"];
  const BOOK = { bukhari: "صحيح البخاري", muslim: "صحيح مسلم", abudawud: "سنن أبي داود", tirmidhi: "جامع الترمذي", nasai: "سنن النسائي", ibnmajah: "سنن ابن ماجه" };
  const AUTHOR = { bukhari: "البخاري", muslim: "مسلم", abudawud: "أبو داود", tirmidhi: "الترمذي", nasai: "النسائي", ibnmajah: "ابن ماجه" };
  const PREFIX = { bukhari: "b", muslim: "m", abudawud: "d", tirmidhi: "t", nasai: "n", ibnmajah: "j" };
  const BOOK_OF = Object.fromEntries(Object.entries(PREFIX).map(([b, p]) => [p, b]));
  const BOOK_SHORT = Object.fromEntries(Object.entries(PREFIX).map(([b, p]) => [p, AUTHOR[b]]));
  const LAST_NUMBER = { b: 7563, m: 3033, d: 5274, t: 3956, n: 5774, j: 4341 };
  const NUMBERING = { bukhari: "ترقيم فتح الباري", muslim: "ترقيم محمد فؤاد عبد الباقي", abudawud: "ترقيم محمد محيي الدين عبد الحميد",
    tirmidhi: "ترقيم أحمد شاكر", nasai: "ترقيم برنامج الجامع", ibnmajah: "ترقيم محمد فؤاد عبد الباقي" };
  const SAHIHAYN = new Set(["bukhari", "muslim"]);
  const bookOf = (k) => BOOK_OF[k[0]];
  const CLS_LABEL = {
    nabi: "النبي ﷺ", sahabi: "صحابي", thiqa: "ثقة", saduq: "صدوق", maqbul: "مقبول / مجهول الحال",
    weak: "تُكلِّم فيه", unknown: "لم تتوفر رتبته", imam: "صاحب الكتاب", taliq: "موضع تعليق", mubham: "مبهم",
  };
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
      cache.set(path, fetch(path).then((r) => {
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
  function setSeg(sel, btn) { for (const b of document.querySelectorAll(`${sel} button`)) b.classList.toggle("on", b === btn); }

  // ---------- router ----------
  const routes = [
    [/^\/?$/, viewHome],
    [/^\/books$/, viewBooks],
    [/^\/book\/(bukhari|muslim|abudawud|tirmidhi|nasai|ibnmajah)$/, viewBook],
    [/^\/book\/(bukhari|muslim|abudawud|tirmidhi|nasai|ibnmajah)\/(\d+)(?:\/(\d+))?$/, viewKitab],
    [/^\/h\/([bmdtnj]\d+)$/, viewHadith],
    [/^\/n\/(.+)$/, viewNarrator],
    [/^\/narrators$/, viewNarrators],
    [/^\/search\/(.*)$/, viewSearch],
    [/^\/about$/, viewAbout],
  ];
  async function route() {
    const path = decodeURIComponent(location.hash.replace(/^#/, "")) || "/";
    for (const a of document.querySelectorAll(".nav a")) {
      const nav = a.dataset.nav;
      a.classList.toggle("active", (nav === "home" && path === "/") || (nav === "books" && path.startsWith("/book")) || (nav !== "home" && nav !== "books" && path.includes(nav)));
    }
    for (const [re, fn] of routes) {
      const m = path.match(re);
      if (m) {
        app.innerHTML = '<div class="loading">جارٍ التحميل…</div>';
        try { await meta(); await fn(...m.slice(1)); } catch (e) { console.error(e); app.innerHTML = `<div class="panel">تعذّر التحميل: ${esc(e.message)}</div>`; }
        window.scrollTo(0, 0);
        return;
      }
    }
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
    const hist = (rows, height = 150) => {
      const max = Math.max(...rows.map((r) => r[1]), 1);
      return `<div class="hist" style="height:${height}px">${rows.map(([label, v, title]) => `<div class="col" title="${esc(title || label)}: ${fmt(v)}"><i>${fmt(v)}</i><b style="height:${(100 * v) / max}%"></b><small>${esc(label)}</small></div>`).join("")}</div>`;
    };
    const gradeTotal = S.grades.reduce((a, [, v]) => a + v, 0) || 1;
    const lenRows = (b) => S.chain_length[b].filter(([l]) => l >= 2 && l <= 10);
    const classRows = (b) => {
      const rows = S.chain_classes[b], tot = rows.reduce((a, [, v]) => a + v, 0) || 1;
      return `<div class="stack">${rows.map(([c, v]) => `<span class="ch-${c}" style="width:${(100 * v) / tot}%" title="${CHAIN_LABEL[c][0]}: ${fmt(v)}"></span>`).join("")}</div>
        <div class="legend">${rows.map(([c, v]) => `<span><i class="ch-${c}"></i>${CHAIN_LABEL[c][0]} ${fmt(v)}</span>`).join("")}</div>`;
    };

    app.innerHTML = `
      <div class="section-title" style="margin-top:0"><h1>مؤشرات أسانيد الكتب الستة</h1><p>محسوبة من سلاسل الرواة نفسها</p></div>
      <div class="grid kpis">
        ${kpi(T.hadith, "حديثًا في الكتب الستة", `${fmt(T.chains)} إسنادًا`)}
        ${kpi(T.narrators, "راويًا", `${fmt(T.narrators_shaykhayn)} من رجال الشيخين معًا`)}
        ${kpi(T.companions, "صحابيًا وصحابية", "في أسانيد الكتب الستة")}
        ${kpi(T.muttafaq, "حديثًا متفقًا عليه", "من أحاديث مسلم، بحسب تخريج البرنامج")}
        ${kpi(T.sitta, "حديثًا رواه الستة", "من أحاديث البخاري، بحسب تخريج البرنامج")}
        ${kpi(T.thulathiyyat, "من ثلاثيات البخاري", "أعلى أسانيده")}
        ${kpi(T.mudallisun, "راويًا موصوفًا بالتدليس", `و${fmt(T.mukhtalitun)} ممن اختلط`)}
      </div>

      <div class="panel" style="margin-top:16px"><h2>الكتب الستة</h2>
        <div class="table-wrap"><table class="books-table"><thead><tr><th>الكتاب</th><th>الأحاديث</th><th>الأسانيد</th><th>الرواة</th></tr></thead>
        <tbody>${BOOKS.map((b) => `<tr><td><a href="#/book/${b}">${BOOK[b]}</a></td><td>${fmt(T.books[b].hadith)}</td><td>${fmt(T.books[b].chains)}</td><td>${fmt(T.books[b].narrators)}</td></tr>`).join("")}</tbody></table></div></div>

      <div class="grid g2" style="margin-top:16px">
        <div class="panel"><h2>الأكثر رواية</h2><p class="muted small">عدد الأحاديث التي ورد الراوي في أسانيدها في الكتب الستة</p>${bars(S.top_narrators.slice(0, 12))}</div>
        <div class="panel"><h2>الصحابة الأكثر رواية</h2><p class="muted small">في الكتب الستة، مع المكرر</p>${bars(S.top_companions.slice(0, 12))}</div>
      </div>
      <div class="panel" style="margin-top:16px"><h2>أكثر الشيوخ الذين حدّث عنهم أصحاب الكتب</h2>
        <div class="seg" id="shf">${BOOKS.map((b, i) => `<button data-v="${b}" class="${i ? "" : "on"}">${AUTHOR[b]}</button>`).join("")}</div>
        <p class="muted small" id="shf-note"></p><div id="shf-bars"></div></div>

      <div class="grid g2" style="margin-top:16px">
        <div class="panel"><h2>أشهر الأسانيد</h2><p class="muted small">أكثر السلاسل تكرارًا (الصحابي واثنان دونه)</p>
          <ul class="list">${S.top_isnads.slice(0, 10).map(([c, v]) => `<li><div class="meta-line"><span class="tag">${fmt(v)} إسنادًا</span></div>${chainHTML(c, N)}</li>`).join("")}</ul></div>
        <div class="panel"><h2>أكثر الرواة مدارًا</h2><p class="muted small">الراوي الذي تلتقي عنده طرق الحديث الواحد في الكتب الستة ثم تتفرع عنه</p>${bars(S.top_madar.slice(0, 12))}</div>
      </div>

      <div class="grid g2" style="margin-top:16px">
        <div class="panel"><h2>الأكثر طرقًا في الكتب الستة</h2>
          <ul class="list">${S.most_turuq.slice(0, 8).map((g) => `<li><div class="meta-line"><span class="tag ok">${fmt(g.n_chains)} إسنادًا</span><span>${fmt(g.n_hadiths)} رواية</span><span>${g.books.map((b) => BOOK[b]).join(" و")}</span></div>
            <a href="#/h/${g.first}" class="snip" style="color:inherit">${esc(g.snippet)}</a></li>`).join("")}</ul></div>
        <div class="panel"><h2>الأوسع انتشارًا في كتب السنة</h2><p class="muted small">أحاديث الكتب الستة بحسب عدد رواياتها في تخريج برنامج الجامع</p>
          <ul class="list">${S.widest.slice(0, 8).map((g) => `<li><div class="meta-line"><span class="tag ok">${fmt(g.n_hadith)} رواية</span><span>في ${fmt(g.n_books)} كتابًا</span>${g.n_shawahid ? `<span>وله شواهد عن ${fmt(g.n_shawahid)} صحابيًا</span>` : ""}</div>
            <a href="#/h/${g.first}" class="snip" style="color:inherit">${esc(g.snippet)}</a></li>`).join("")}</ul></div>
      </div>

      <div class="grid g2" style="margin-top:16px">
        <div class="panel"><h2>رجال الأسانيد</h2><p class="muted small">وصف كل إسناد بأدنى رتبة فيه عند ابن حجر</p>
          ${BOOKS.map((b, i) => `<h3 class="muted"${i ? ' style="margin-top:12px"' : ""}>${BOOK[b]}</h3>${classRows(b)}`).join("")}
          <p class="muted small" style="margin-top:12px">وصفٌ لرجال الأسانيد المفردة لا حكمٌ على الأحاديث: فأحاديث الصحيحين صحيحة بحكم الشيخين، وأحاديث السنن يُرجع في الحكم عليها إلى أحكام المحدثين.</p></div>
        <div class="panel"><h2>رتب الرواة</h2><p class="muted small">تصنيف مبسّط لرتب الرواة عند ابن حجر في «التقريب»</p>
          <div class="stack">${S.grades.map(([c, v]) => `<span class="cls-${c}" style="width:${(100 * v) / gradeTotal}%;background:var(--c)" title="${CLS_LABEL[c]}: ${fmt(v)}"></span>`).join("")}</div>
          <div class="legend">${S.grades.filter(([, v]) => v).map(([c, v]) => `<span class="cls-${c}"><i style="background:var(--c)"></i>${CLS_LABEL[c]} ${fmt(v)}</span>`).join("")}</div>
          <h3 style="margin-top:18px">الرواة حسب الطبقة</h3>${hist(S.tabaqat.map(([label, v, t]) => [String(t), v, label]))}
          <p class="muted small">1 = الصحابة … 12 = صغار الآخذين عن تبع الأتباع (طبقات ابن حجر)</p></div>
      </div>

      <div class="grid g2" style="margin-top:16px">
        <div class="panel"><h2>طول الإسناد (عدد الرواة بين المصنف والنبي ﷺ)</h2>
          ${BOOKS.map((b) => `<h3 class="muted">${BOOK[b]}</h3>${hist(lenRows(b).map(([l, v]) => [String(l), v, `${l} رواة`]), 80)}`).join("")}</div>
        <div class="panel"><h2>وفيات الرواة</h2><p class="muted small">عدد الرواة بحسب سنة الوفاة (كل 25 سنة هجرية)</p>${hist(S.deaths.map(([y, v]) => [String(y), v, `${y}–${y + 24} هـ`]))}
          <h3 style="margin-top:14px">مدن الرواة</h3>${bars(S.cities.slice(0, 8), false)}</div>
      </div>

      <div class="grid g2" style="margin-top:16px">
        <div class="panel"><h2>الأكثر بحثًا وزيارة</h2><div id="popular"></div></div>
        <div class="panel"><h2>ثلاثيات البخاري</h2><p class="muted small">ما بين البخاري والنبي ﷺ فيها ثلاثة رواة</p>
          <ul class="list">${S.thulathiyyat.map((t, i) => `${i === 6 ? `</ul><details><summary class="small">عرض الكل (${fmt(S.thulathiyyat.length)})</summary><ul class="list">` : ""}<li><div class="meta-line"><a href="#/h/${t.k}">البخاري ${t.num}</a><span>${esc(clip(t.snippet, 70))}</span></div>${chainHTML(t.chain, N, "البخاري")}</li>`).join("")}</ul>${S.thulathiyyat.length > 6 ? "</details>" : ""}</div>
      </div>`;
    renderPopular();
    const showShaykhs = (b) => {
      $("#shf-note").textContent = `عدد الأسانيد التي حدّث بها ${AUTHOR[b]} عن كل شيخ`;
      $("#shf-bars").innerHTML = bars(S.top_shaykhs[b].slice(0, 10));
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
    app.innerHTML = `<h1>الكتب الستة</h1><p class="muted">أصول دواوين السنة، بأسانيدها ورواتها، من برنامج جامع خادم الحرمين الشريفين</p>
      <div class="kitabs books">${BOOKS.map((b) => `<a href="#/book/${b}"><span><b>${BOOK[b]}</b><br><span class="muted small">${NUMBERING[b]}</span></span>
        <span class="muted small">${fmt(S.totals.books[b].hadith)} حديثًا</span></a>`).join("")}</div>
      <p class="notice" style="margin-top:16px">أحاديث الصحيحين صحيحة بحكم الشيخين. وأحاديث السنن فيها الصحيح والحسن والضعيف، فراجع أحكام المحدثين في صفحة كل حديث.</p>`;
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
  const hadithTextHTML = (h, nar) => h.parts.map((p) => `<p>${partHTML(p, nar)}</p>`).join("");
  const matnOf = (h) => { const p = h.parts[0]; return p.matn ? p.text.slice(p.matn[0], p.matn[1]) : p.text; };

  // The Dorar API cannot be embedded (served as text/html with nosniff and no CORS), so we link
  // to its hadith encyclopedia search for the opening words of the matn.
  function dorarURL(h) {
    const words = matnOf(h).replace(/[\u064B-\u0652\u0670\u0640]/g, "").replace(/[^\u0621-\u064A\s]/g, " ")
      .split(/\s+/).filter(Boolean).slice(0, 7).join(" ");
    return `https://dorar.net/hadith/search?q=${encodeURIComponent(words)}&st=w`;
  }

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
        <span>${NUMBERING[book]}</span>${h.parts.length > 1 ? `<span>· ${fmt(h.parts.length)} روايات تحت هذا الرقم</span>` : ""}</div>
      <div class="panel hadith-text">${hadithTextHTML(h, G.nar)}</div>
      ${SAHIHAYN.has(book) ? "" : `<p class="notice sunan-note">أحاديث ${BOOK[book]} فيها الصحيح والحسن والضعيف، فراجع أحكام المحدثين قبل الاستدلال بهذا الحديث.</p>`}
      ${h.verdicts && h.verdicts.length ? `<div class="verdicts tirmidhi">${h.verdicts.map((v) => `<blockquote><cite>قال الترمذي</cite>${esc(v)}</blockquote>`).join("")}
        <p class="muted small">للترمذي اصطلاح خاص في التحسين يختلف عن اصطلاح المتأخرين، فيُنظر معه في أحكام المحدثين الآخرين.</p></div>` : ""}

      <div class="summary">
        <span class="pill">أسانيده هنا: <b>${fmt(h.chains.length)}</b></span>
        <span class="pill">مع رواياته في الكتب الستة: <b>${fmt(G.n_chains)}</b> إسنادًا في <b>${fmt(G.hadiths.length)}</b> رواية</span>
        <span class="pill">الصحابة في الكتب الستة: <b>${fmt(companions.length)}</b></span>
        ${madar ? `<span class="pill">المدار: <b><a href="#/n/${encodeURIComponent(G.madar)}">${esc(shortName(madar.name))}</a></b></span>` : ""}
        ${sp && sp.n_hadith ? `<span class="pill">تخريجه في كتب السنة: <b>${fmt(sp.n_hadith)}</b> رواية في <b>${fmt(sp.n_books)}</b> كتابًا</span>` : ""}
        ${sp && sp.shawahid.length ? `<span class="pill">له شواهد عن: <b>${fmt(sp.shawahid.length)}</b> صحابيًا</span>` : ""}
      </div>

      <div class="panel dorar">
        <div><h3>أحكام المحدثين على هذا الحديث</h3>
          <p class="muted small">من الموسوعة الحديثية في موقع الدرر السنية: نتائج البحث عن طرف الحديث، وقد تشمل رواياتٍ أخرى مشابهة.</p></div>
        <a class="btn on" href="${dorarURL(h)}" target="_blank" rel="noopener">اعرض الأحكام في الدرر السنية ↗</a>
      </div>

      <div class="hadith-layout">
        <div class="tree-wrap">
          <div class="tree-tools">
            <div class="seg" id="scope">
              <button data-v="one" class="${others.length ? "" : "on"}">هذه الرواية</button>
              ${others.length ? `<button data-v="all" class="on">كل طرقه في الكتب الستة (${fmt(G.n_chains)})</button>` : ""}
            </div>
            ${G.books.length > 1 ? `<div class="seg" id="bookf"><button data-v="" class="on">الكل</button>${BOOKS.filter((b) => G.books.includes(b)).map((b) => `<button data-v="${PREFIX[b]}">${AUTHOR[b]}</button>`).join("")}</div>` : ""}
            <button class="btn" id="fit">ملاءمة العرض</button>
            <button class="btn" id="png">حفظ صورة</button>
            <a class="btn" href="${mailto(`نور السنة: ملاحظة على ${hkey(key)}`)}">أبلغ عن خطأ</a>
          </div>
          <div id="tree" role="img" aria-label="شجرة الرواة"></div>
          <div class="legend">${["nabi", "sahabi", "thiqa", "saduq", "maqbul", "weak", "imam"].map((c) => `<span class="cls-${c}"><i style="background:var(--c)"></i>${CLS_LABEL[c]}</span>`).join("")}<span><i style="background:transparent;border:2px solid var(--gold)"></i>المدار</span><span class="muted">سُمك الخط = عدد الطرق</span></div>
        </div>
        <aside class="panel side" id="side"><p class="empty">اضغط على أي راوٍ في الشجرة لعرض ترجمته المختصرة وتمييز الطرق التي تمر به.</p></aside>
      </div>

      <div class="section-title"><h2>أسانيده</h2><p>وصف رجال كل إسناد بحسب رتبهم عند ابن حجر، وليس حكمًا على الحديث</p></div>
      <div class="panel"><ul class="list">${h.chains.map((c) => chainRow(c, G.nar, compilerOf(key))).join("") || '<li class="muted">لا يوجد إسناد مستخرج لهذه الرواية.</li>'}</ul></div>

      ${others.length ? `<div class="section-title"><h2>رواياته الأخرى في الكتب الستة</h2><p>كما في تخريج البرنامج · «متابعة»: عن الصحابي نفسه · «شاهد»: عن صحابي آخر</p></div>
      <div class="panel"><ul class="list">${others.map((k) => {
        const o = G.items[k];
        const shahid = !o.chains.some((c) => ownCompanions.has(c.ids[0]));
        return `<li><div class="meta-line"><a href="#/h/${k}">${hkey(k)}</a><span class="tag">${shahid ? "شاهد" : "متابعة"}</span>${o.bab ? `<span>${esc(o.bab)}</span>` : ""}</div>
          <div class="snip">${esc(clip(matnOf(o), 260))}</div>
          ${o.chains.slice(0, 3).map((c) => chainHTML(c.ids, G.nar, compilerOf(k))).join("")}${o.chains.length > 3 ? `<p class="muted small">و${fmt(o.chains.length - 3)} أسانيد أخرى</p>` : ""}</li>`;
      }).join("")}</ul></div>` : ""}

      ${sp && sp.books.length ? `<div class="section-title"><h2>تخريجه في كتب السنة</h2><p>عدد رواياته في كل كتاب بحسب تخريج برنامج جامع خادم الحرمين الشريفين</p></div>
      <div class="panel"><div class="chain">${sp.books.map(([b, n]) => `<span class="chip">${esc(b)}<span class="muted small" style="margin-inline-start:6px">${fmt(n)}</span></span>`).join(" ")}${sp.n_books > sp.books.length ? `<span class="muted small">و${fmt(sp.n_books - sp.books.length)} كتابًا آخر</span>` : ""}</div>
        ${sp.shawahid.length ? `<h3 style="margin-top:14px">شواهده عن صحابة آخرين</h3><div class="chain">${sp.shawahid.map((n) => `<span class="chip cls-sahabi"><span class="dot"></span>${esc(n)}</span>`).join(" ")}</div>` : ""}</div>` : ""}`;

    let scope = others.length ? "all" : "one", bookFilter = "";
    const draw = () => drawTree(G, scope === "one" ? [key] : G.hadiths.filter((k) => !bookFilter || k[0] === bookFilter), key);
    draw();
    $("#scope")?.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; scope = b.dataset.v; setSeg("#scope", b); draw(); });
    $("#bookf")?.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; bookFilter = b.dataset.v; setSeg("#bookf", b); draw(); });
    $("#fit").addEventListener("click", () => cy && cy.fit(undefined, 16));
    $("#png").addEventListener("click", () => {
      if (!cy) return;
      const a = document.createElement("a");
      a.href = cy.png({ full: true, scale: 2, bg: getComputedStyle(document.body).backgroundColor });
      a.download = `isnad-${key}.png`;
      a.click();
    });
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
    if (compiler === "البخاري" && c.ids.length === 3 && nar[c.ids[0]]?.cls === "sahabi") tags.push('<span class="tag ok">ثلاثي</span>');
    return `<li><div class="meta-line">${tags.join("")}</div>${chainHTML(c.ids, nar, compiler)}</li>`;
  }

  // ---------- tree ----------
  let cy = null;
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

  function drawTree(G, keys, focusKey) {
    const nar = G.nar;
    const nodes = new Map(), edges = new Map(), focusEdges = new Set();
    const addNode = (id) => nodes.set(id, (nodes.get(id) || 0) + 1);
    for (const k of keys) {
      const comp = bookOf(k);
      for (const c of G.items[k].chains) {
        const full = ["nabi", ...c.ids, comp];
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
          "width": (e) => Math.min(1.2 + Math.log2(e.data("w")) * 1.4, 7), "line-color": css("--edge"),
          "target-arrow-shape": "triangle", "target-arrow-color": css("--edge"), "arrow-scale": 0.8, "curve-style": "bezier",
        } },
        { selector: "edge[focus = 1]", style: { "line-color": css("--accent"), "target-arrow-color": css("--accent") } },
        { selector: ".dim", style: { "opacity": 0.15 } },
        { selector: ".hl", style: { "line-color": css("--gold"), "target-arrow-color": css("--gold") } },
      ],
    });
    readable(cy, "nabi");
    cy.on("tap", "node", (e) => selectNode(e.target, G));
    cy.on("tap", (e) => { if (e.target === cy) cy.elements().removeClass("dim hl"); });
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
        ${info.death ? `<dt>الوفاة</dt><dd>${esc(info.death)} هـ</dd>` : ""}
        ${info.tadlis ? "<dt>تنبيه</dt><dd>موصوف بالتدليس</dd>" : ""}
        ${info.ikhtilat ? "<dt>تنبيه</dt><dd>اختلط في آخر عمره</dd>" : ""}
        <dt>في هذه الشجرة</dt><dd>${fmt(node.data("n"))} إسنادًا · ${fmt(students.length)} من الرواة عنه</dd>
      </dl>
      ${id === G.madar ? '<p class="notice">هذا الراوي مدار الحديث: تلتقي عنده الطرق ثم تتفرع عنه.</p>' : ""}
      <p class="small"><b>روى عن:</b> ${teachers.map(nm).join("، ") || "—"}</p>
      <p class="small"><b>روى عنه هنا:</b> ${students.map(nm).join("، ") || "—"}</p>
      <a class="btn" href="#/n/${encodeURIComponent(id)}">الترجمة الكاملة ←</a>`;
  }

  // ---------- narrator page ----------
  async function viewNarrator(id) {
    const n = await narrator(id);
    if (!n) { app.innerHTML = '<div class="panel">الراوي غير موجود.</div>'; return; }
    const D = META.directory;
    const fixed = { nabi: ["النبي ﷺ", "nabi"], ...Object.fromEntries(BOOKS.map((b) => [b, [`الإمام ${AUTHOR[b]}`, "imam"]])) };
    const name = (x) => (D[x] ? D[x][0] : fixed[x] ? fixed[x][0] : x);
    const clsOf = (x) => (D[x] ? D[x][1] : fixed[x] ? fixed[x][1] : "unknown");
    const rel = (rows) => rows.map(([x, c]) => {
      const inner = `<span class="dot"></span>${esc(shortName(name(x)))}<span class="muted small" style="margin-inline-start:6px">${fmt(c)}</span>`;
      return D[x] ? `<a class="chip cls-${clsOf(x)}" href="#/n/${encodeURIComponent(x)}">${inner}</a>` : `<span class="chip cls-${clsOf(x)}">${inner}</span>`;
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
        ${flags.map((f) => `<span class="pill" style="color:var(--c-maqbul)">${f}</span>`).join("")}
        ${BOOKS.filter((b) => (n.hadiths || {})[b]).map((b) => `<span class="pill">${AUTHOR[b]}: <b>${fmt(n.hadiths[b].length)}</b></span>`).join("")}
        <span class="pill">شيوخه: <b>${fmt(n.n_teachers)}</b></span>
        <span class="pill">تلاميذه: <b>${fmt(n.n_students)}</b></span>
      </div>
      <div class="grid g2">
        <div class="panel"><h2>الترجمة</h2>
          ${n.rank || n.rank_dhahabi ? `<div class="verdicts">
            ${n.rank ? `<blockquote><cite>رتبته عند ابن حجر</cite>${esc(n.rank)}</blockquote>` : ""}
            ${n.rank_dhahabi ? `<blockquote><cite>رتبته عند الذهبي</cite>${esc(n.rank_dhahabi)}</blockquote>` : ""}</div>` : ""}
          <dl class="facts">${facts.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
        </div>
        <div class="panel"><h2>شبكة الراوي</h2><p class="muted small">أبرز شيوخه (يمينًا) وتلاميذه (يسارًا) في الكتب الستة — اضغط للانتقال</p><div id="ego"></div></div>
      </div>
      <div class="grid g2" style="margin-top:16px">
        <div class="panel"><h2>روى عن</h2><p class="muted small">مع عدد الأسانيد في الكتب الستة</p><div class="chain">${rel(n.teachers || []) || '<span class="muted">—</span>'}</div></div>
        <div class="panel"><h2>روى عنه</h2><p class="muted small">مع عدد الأسانيد في الكتب الستة</p><div class="chain">${rel(n.students || []) || '<span class="muted">—</span>'}</div></div>
      </div>
      <div class="section-title"><h2>أحاديثه في الكتب الستة</h2></div>
      <div class="panel" id="hlist"></div>`;
    drawEgo(n, name, clsOf);
    renderNarratorHadiths(n, 1);
  }

  async function renderNarratorHadiths(n, page) {
    const box = $("#hlist");
    box.innerHTML = '<div class="loading">جارٍ التحميل…</div>';
    const books = BOOKS.filter((b) => (n.hadiths || {})[b]);
    const keys = books.flatMap((b) => n.hadiths[b]);
    const idx = await searchIndex(books);
    const textOf = new Map(idx.map((r) => [r[0], r]));
    const pages = Math.ceil(keys.length / PAGE);
    const slice = keys.slice((page - 1) * PAGE, page * PAGE);
    box.innerHTML = `<ul class="list">${slice.map((k) => {
      const r = textOf.get(k);
      return `<li><div class="meta-line"><a href="#/h/${k}">${hkey(k)}</a>${r && r[3] ? `<span>${esc(r[3])}</span>` : ""}</div><div class="snip">${esc(clip(r ? r[2] : "", 200))}</div></li>`;
    }).join("")}</ul>${pages > 1 ? `<div class="pager">${page > 1 ? '<button class="btn" data-p="-1">السابق</button>' : ""}<span class="muted">${page} / ${pages}</span>${page < pages ? '<button class="btn" data-p="1">التالي</button>' : ""}</div>` : ""}`;
    box.querySelectorAll("[data-p]").forEach((b) => b.addEventListener("click", () => {
      renderNarratorHadiths(n, page + +b.dataset.p);
      box.scrollIntoView({ behavior: "smooth" });
    }));
  }

  function drawEgo(n, name, clsOf) {
    const T = (n.teachers || []).slice(0, 12), S = (n.students || []).slice(0, 12);
    const els = [{ data: { id: n.id, label: shortName(n.name), cls: n.cls, me: 1 } }];
    for (const [x, c] of T) { els.push({ data: { id: "t" + x, ref: x, label: shortName(name(x)), cls: clsOf(x) } }); els.push({ data: { source: "t" + x, target: n.id, w: c } }); }
    for (const [x, c] of S) { els.push({ data: { id: "s" + x, ref: x, label: shortName(name(x)), cls: clsOf(x) } }); els.push({ data: { source: n.id, target: "s" + x, w: c } }); }
    const color = (c) => css(`--c-${c}`) || css("--c-unknown");
    const ego = cytoscape({
      container: $("#ego"), elements: els, minZoom: 0.2, maxZoom: 2, wheelSensitivity: 0.25,
      layout: { name: "dagre", rankDir: "RL", nodeSep: 6, rankSep: 90, padding: 12 },
      style: [
        { selector: "node", style: { "shape": "round-rectangle", "width": "label", "height": "label", "padding": "6px", "background-color": css("--panel"),
          "border-width": 2, "border-color": (e) => color(e.data("cls")), "label": "data(label)", "color": css("--ink"),
          "font-family": "-apple-system, BlinkMacSystemFont, Tajawal, sans-serif", "font-size": 11, "text-valign": "center", "text-wrap": "wrap", "text-max-width": 90 } },
        { selector: "node[me = 1]", style: { "background-color": css("--accent"), "color": css("--accent-ink"), "font-size": 13, "font-weight": 700 } },
        { selector: "edge", style: { "width": (e) => Math.min(1 + Math.log2(e.data("w")), 6), "line-color": css("--edge"), "curve-style": "bezier",
          "target-arrow-shape": "triangle", "target-arrow-color": css("--edge"), "arrow-scale": 0.7 } },
      ],
    });
    readable(ego, n.id, true);
    ego.on("tap", "node", (e) => {
      const ref = e.target.data("ref");
      if (ref && META.directory[ref]) location.hash = "#/n/" + encodeURIComponent(ref);
    });
  }

  // ---------- narrators directory ----------
  async function viewNarrators() {
    const all = Object.entries(META.directory).sort((a, b) => totalOf(b[1]) - totalOf(a[1]));
    app.innerHTML = `<h1>الرواة</h1><p class="muted">${fmt(all.length)} راويًا في أسانيد الكتب الستة، مرتبين حسب عدد الأحاديث</p>
      <div class="tree-tools"><input id="nf" class="btn" style="flex:1;min-width:200px" placeholder="تصفية بالاسم…">
        <div class="seg" id="cf"><button data-v="" class="on">الكل</button>${["sahabi", "thiqa", "saduq", "maqbul", "weak"].map((c) => `<button data-v="${c}">${CLS_LABEL[c]}</button>`).join("")}</div></div>
      <div class="panel"><ul class="bars" id="nl"></ul></div>`;
    let q = "", cls = "";
    const render = () => {
      const nq = norm(q);
      const rows = all.filter(([, v]) => (!cls || v[1] === cls) && (!nq || norm(v[0]).includes(nq))).slice(0, 300);
      $("#nl").innerHTML = rows.map(([id, v]) => `<li><span class="name"><a href="#/n/${encodeURIComponent(id)}" class="cls-${v[1]}"><span class="dot"></span>${esc(v[0])}</a></span><span class="num">${countsLabel(v[2])}</span></li>`).join("") || '<li class="muted">لا نتائج</li>';
    };
    render();
    $("#nf").addEventListener("input", (e) => { q = e.target.value; render(); });
    $("#cf").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; cls = b.dataset.v; setSeg("#cf", b); render(); });
  }

  // ---------- search ----------
  async function viewSearch(q) {
    q = q.trim();
    $("#q").value = q;
    if (!q) { location.hash = "#/"; return; }
    track("search", q);
    const idx = await searchIndex();
    const words = norm(q).split(" ").filter(Boolean);
    const narrators = Object.entries(META.directory).filter(([, v]) => words.every((w) => norm(v[0]).includes(w)))
      .sort((a, b) => totalOf(b[1]) - totalOf(a[1])).slice(0, 12);
    const hits = idx.filter((r) => words.every((w) => r[2].includes(w)));
    const shown = hits.slice(0, 100);
    const around = (t, w) => { const i = t.indexOf(w); return i > 80 ? "…" + t.slice(i - 80) : t; };
    const mark = (t) => {
      let s = esc(clip(around(t, words[0]), 260));
      for (const w of words) s = s.split(w).join(`<mark>${w}</mark>`);
      return s;
    };
    app.innerHTML = `<h1>نتائج البحث: «${esc(q)}»</h1>
      ${narrators.length ? `<div class="panel" style="margin-bottom:16px"><h2>رواة</h2><div class="chain">${narrators.map(([id, v]) => `<a class="chip cls-${v[1]}" href="#/n/${encodeURIComponent(id)}"><span class="dot"></span>${esc(v[0])}</a>`).join(" ")}</div></div>` : ""}
      <div class="panel"><h2>أحاديث <span class="muted small">(${fmt(hits.length)}${hits.length > shown.length ? `، يُعرض أول ${shown.length}` : ""})</span></h2>
        <ul class="list">${shown.map((r) => `<li><div class="meta-line"><a href="#/h/${r[0]}">${hkey(r[0])}</a>${r[3] ? `<span>${esc(r[3])}</span>` : ""}</div><div class="snip">${mark(r[2])}</div></li>`).join("") || '<li class="muted">لا نتائج. جرّب كلمات أقل أو صيغة أخرى.</li>'}</ul></div>`;
  }

  $("#searchForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = $("#q").value.trim();
    if (q) location.hash = "#/search/" + encodeURIComponent(q);
  });

  // ---------- about ----------
  async function viewAbout() {
    app.innerHTML = `<div class="panel" style="max-width:820px">
      <h1>عن المشروع</h1>
      <p>«نور السنة» أداة مفتوحة لدراسة أسانيد الكتب الستة: تعرض لكل حديث شجرة رواته وطرقه فيها، وتُظهر مدار الحديث ومتابعاته وشواهده وتخريجه في كتب السنة، وتربط كل راوٍ بترجمته ورتبته عند ابن حجر والذهبي.</p>
      <h2>منهج العرض</h2>
      <ul>
        <li>أحاديث الصحيحين صحيحة بحكم الشيخين وتلقي الأمة لهما بالقبول. ووصف رجال كل إسناد بحسب رتبهم عند ابن حجر بيانٌ لحال الرجال، لا حكمٌ على الحديث.</li>
        <li>رواية الشيخين عمن تُكلِّم فيه تكون غالبًا في المتابعات والشواهد، أو مما انتقياه من صحيح حديثه.</li>
        <li>«المدار» يُحسب آليًا: هو الراوي الذي تتفرع عنه أكثر الطرق داخل الكتب الستة.</li>
        <li>جمع روايات الحديث الواحد في الكتب الستة قائم على تخريج برنامج جامع خادم الحرمين الشريفين.</li>
        <li>أحاديث السنن فيها الصحيح والحسن والضعيف، ويُعرض حكم الترمذي بلفظه حيث ورد، وتُربط كل الأحاديث بأحكام المحدثين في الدرر السنية.</li>
        <li>الترقيم: البخاري على «فتح الباري»، ومسلم وابن ماجه على ترقيم محمد فؤاد عبد الباقي، وأبو داود على ترقيم محمد محيي الدين عبد الحميد، والترمذي على ترقيم أحمد شاكر، والنسائي على ترقيم برنامج الجامع.</li>
        <li>فهرس الكتب الكبرى للسنن الأربع من <a href="https://shamela.ws/" target="_blank" rel="noopener">المكتبة الشاملة</a>.</li>
      </ul>
      <h2>مصادر البيانات</h2>
      <p>نصوص الأحاديث وأسانيدها، وتراجم الرواة ورتبهم، والتخريج والشواهد: من <a href="https://sunna.alifta.gov.sa/" target="_blank" rel="noopener">برنامج جامع خادم الحرمين الشريفين للسنة النبوية</a> (الرئاسة العامة للبحوث العلمية والإفتاء)، عن النسخة المهيكلة التي نشرها الباحث جهاد عمر (<a href="https://github.com/JehadOumer/Ifta-Sunnah-Hadith-and-Narrators-Dataset" target="_blank" rel="noopener">Ifta Sunnah Hadith &amp; Narrators Dataset</a>).</p>
      <p>أحكام المحدثين على الأحاديث: روابط إلى <a href="https://dorar.net/hadith" target="_blank" rel="noopener">الموسوعة الحديثية في موقع الدرر السنية</a>، تُفتح في موقعهم.</p>
      <p class="muted small">الحقوق العلمية محفوظة لأصحابها: برنامج الجامع للرئاسة العامة للبحوث العلمية والإفتاء، والموسوعة الحديثية للدرر السنية. والموقع مستقل ولا يمثل أيًّا منهما.</p>
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
