// «ثبّت التطبيق»: every [data-install] button stays hidden until the browser can install the site.
// Chrome/Edge/Android hand us their install prompt; Safari on iPhone/iPad has none, so the button explains
// "Share → Add to Home Screen" instead. Nothing shows once the site runs as the installed app.
(() => {
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let prompt = null;
  const buttons = () => document.querySelectorAll("[data-install]");
  const show = (on) => buttons().forEach((b) => { b.hidden = !on; });

  function iosHelp() {
    let d = document.getElementById("installHelp");
    if (!d) {
      const css = document.createElement("style");
      css.textContent = `#installHelp { border: 1px solid rgba(242,193,78,.5); border-radius: 18px; padding: 24px 22px 20px; max-width: 340px; width: calc(100% - 32px);
          background: #0e2c5e; color: #eaf2ff; font: 1rem/1.8 -apple-system, "SF Arabic", "Tajawal", sans-serif; text-align: right; box-shadow: 0 30px 60px -10px #000c; }
        #installHelp::backdrop { background: rgba(4,23,58,.7); backdrop-filter: blur(3px); }
        #installHelp h3 { margin: 0 0 10px; color: #f2c14e; font: 700 1.2rem "Tajawal", sans-serif; }
        #installHelp ol { margin: 0 0 16px; padding-inline-start: 22px; }
        #installHelp li { margin-bottom: 6px; }
        #installHelp svg { width: 18px; height: 18px; vertical-align: -3px; fill: none; stroke: #f2c14e; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
        #installHelp button { width: 100%; padding: 10px; border: 0; border-radius: 10px; background: #f2c14e; color: #0a2a23; font: 700 1rem "Tajawal", sans-serif; cursor: pointer; }`;
      document.head.appendChild(css);
      d = document.createElement("dialog");
      d.id = "installHelp";
      d.setAttribute("dir", "rtl");
      d.innerHTML = `<h3>ثبّت «نور السنة» على جهازك</h3><ol>
          <li>اضغط زر المشاركة <svg viewBox="0 0 24 24" aria-label="مشاركة"><path d="M12 15V3M8 7l4-4 4 4M5 11v9h14v-9"/></svg> في شريط المتصفح.</li>
          <li>اختر «إضافة إلى الشاشة الرئيسية».</li>
          <li>اضغط «إضافة»، فتظهر أيقونة نور السنة بين تطبيقاتك.</li></ol>
        <button type="button">حسنًا</button>`;
      d.querySelector("button").addEventListener("click", () => d.close());
      d.addEventListener("click", (e) => { if (e.target === d) d.close(); });
      document.body.appendChild(d);
    }
    d.showModal();
  }

  addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); prompt = e; if (!standalone) show(true); });
  addEventListener("appinstalled", () => { prompt = null; show(false); });
  document.addEventListener("click", async (e) => {
    if (!e.target.closest("[data-install]")) return;
    e.preventDefault();
    if (prompt) {
      prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === "accepted") { prompt = null; show(false); }
    } else if (ios) iosHelp();
  });
  const init = () => show(!standalone && ios);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
