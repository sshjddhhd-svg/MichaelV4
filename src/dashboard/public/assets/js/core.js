(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);
  let token = localStorage.getItem("mv4_token") || "";
  let threads = [], commands = [], filter = "all", current = null, selected = null;

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      method: opts.method || "GET",
      headers: { "Content-Type": "application/json", "x-core-token": token },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (res.status === 401) { logout(); throw new Error("انتهت الجلسة"); }
    return res.json();
  }

  function toast(msg, bad) {
    const t = $("#toast");
    t.textContent = msg; t.className = "toast" + (bad ? " bad" : ""); t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2600);
    if (navigator.vibrate) navigator.vibrate(bad ? [30, 40, 30] : 20);
  }

  // ── auth ──
  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button"); btn.disabled = true;
    try {
      const r = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: $("#pwd").value }) }).then((r) => r.json());
      if (r.ok) { token = r.token; localStorage.setItem("mv4_token", token); $("#pwd").value = ""; enter(); }
      else { $("#loginErr").textContent = r.error || "كلمة المرور خاطئة"; $("#loginErr").hidden = false; }
    } catch { $("#loginErr").textContent = "تعذر الاتصال بالخادم"; $("#loginErr").hidden = false; }
    btn.disabled = false;
  });

  function logout() {
    if (token) fetch("/api/logout", { method: "POST", headers: { "x-core-token": token } }).catch(() => {});
    token = ""; localStorage.removeItem("mv4_token");
    $("#app").hidden = true; $("#login").hidden = false;
  }
  $("#logoutBtn").addEventListener("click", logout);

  async function enter() {
    $("#login").hidden = true; $("#app").hidden = false; $("#loginErr").hidden = true;
    loadStatus(); loadCommands(); loadThreads();
    clearInterval(enter._i); enter._i = setInterval(loadStatus, 10000);
  }

  // ── status ──
  async function loadStatus() {
    try {
      const r = await api("/api/status");
      $("#dot").className = "dot " + (r.online ? "on" : "off");
      $("#statusText").textContent = r.online ? "متصل" + (r.botID ? " · " + r.botID : "") : "غير متصل — أضف الكوكيز";
    } catch {}
  }

  // ── tabs ──
  $$(".tabbtn").forEach((b) => b.addEventListener("click", () => {
    $$(".tabbtn").forEach((x) => x.classList.toggle("active", x === b));
    $$(".tab").forEach((t) => t.classList.toggle("active", t.id === "tab-" + b.dataset.tab));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }));

  // ── threads ──
  async function loadThreads() {
    $("#threads").innerHTML = '<li class="skel"></li>'.repeat(6); $("#threadsEmpty").hidden = true;
    try {
      const r = await api("/api/bot/threads");
      threads = r.threads || [];
      if (!r.online && !threads.length) return showEmpty("البوت غير متصل. أضف الكوكيز من تبويب الكوكيز.");
      renderThreads();
    } catch (e) { showEmpty(e.message); }
  }
  function showEmpty(msg) { $("#threads").innerHTML = ""; $("#threadsEmpty").textContent = msg; $("#threadsEmpty").hidden = false; }

  function renderThreads() {
    const q = $("#search").value.trim().toLowerCase();
    const list = threads.filter((t) =>
      (filter === "all" || (filter === "group" ? t.isGroup : !t.isGroup)) &&
      (!q || t.name.toLowerCase().includes(q) || t.tid.includes(q)));
    if (!list.length) return showEmpty(threads.length ? "لا توجد نتائج" : "لا توجد محادثات بعد");
    $("#threadsEmpty").hidden = true;
    $("#threads").innerHTML = list.map((t) => `
      <li class="thread" data-tid="${esc(t.tid)}">
        <div class="avatar" ${t.image ? `style="background-image:url('${esc(t.image)}')"` : ""}>${t.image ? "" : esc(t.name.trim()[0] || "?")}</div>
        <div class="grow"><h4>${esc(t.name)}</h4><p>${esc(t.snippet || (t.isGroup ? t.members + " عضو" : "محادثة خاصة"))}</p></div>
        <span class="badge">${t.isGroup ? "مجموعة" : "خاص"}</span>
      </li>`).join("");
  }
  $("#threads").addEventListener("click", (e) => {
    const li = e.target.closest(".thread"); if (!li) return;
    openSheet(threads.find((t) => t.tid === li.dataset.tid));
  });
  $("#search").addEventListener("input", renderThreads);
  $("#refreshBtn").addEventListener("click", loadThreads);
  $$(".chip").forEach((c) => c.addEventListener("click", () => {
    filter = c.dataset.filter; $$(".chip").forEach((x) => x.classList.toggle("active", x === c)); renderThreads();
  }));

  // ── commands sheet ──
  async function loadCommands() {
    try { const r = await api("/api/commands"); commands = r.commands || []; } catch {}
  }
  function openSheet(t) {
    if (!t) return;
    current = t; selected = null; $("#cmdArgs").value = "";
    $("#sheetTitle").textContent = t.name;
    $("#sheetSub").textContent = (t.isGroup ? "مجموعة" : "خاص") + " · " + t.tid;
    const av = $("#sheetAvatar");
    av.style.backgroundImage = t.image ? `url('${t.image}')` : ""; av.textContent = t.image ? "" : (t.name.trim()[0] || "?");
    $("#cmdList").innerHTML = commands.length ? commands.map((c) => `
      <button class="cmd" data-name="${esc(c.name)}"><b>/${esc(c.name)}</b><small>${esc(c.description)}</small></button>`).join("")
      : '<p class="muted">لا توجد أوامر محمّلة</p>';
    updatePreview();
    $("#sheetBg").hidden = false; $("#sheet").classList.add("open"); $("#sheet").setAttribute("aria-hidden", "false");
  }
  function closeSheet() { $("#sheet").classList.remove("open"); $("#sheetBg").hidden = true; $("#sheet").setAttribute("aria-hidden", "true"); }
  $("#sheetClose").addEventListener("click", closeSheet);
  $("#sheetBg").addEventListener("click", closeSheet);
  $("#cmdList").addEventListener("click", (e) => {
    const b = e.target.closest(".cmd"); if (!b) return;
    selected = b.dataset.name;
    $$(".cmd").forEach((x) => x.classList.toggle("sel", x === b)); updatePreview();
  });
  $("#cmdArgs").addEventListener("input", updatePreview);
  function updatePreview() {
    const a = $("#cmdArgs").value.trim();
    $("#cmdPreview").textContent = "/" + (selected || "…") + (a ? " " + a : "");
    $("#runBtn").disabled = !selected;
  }
  $("#runBtn").addEventListener("click", async () => {
    if (!current || !selected) return;
    const btn = $("#runBtn"); btn.disabled = true; btn.textContent = "جارٍ التفعيل…";
    try {
      const r = await api("/api/bot/run", { method: "POST", body: { threadID: current.tid, command: selected, args: $("#cmdArgs").value } });
      if (r.ok) { toast("✅ تم تفعيل " + r.ran + " في " + current.name); closeSheet(); }
      else toast(r.error || "فشل التفعيل", true);
    } catch (e) { toast(e.message, true); }
    btn.textContent = "تفعيل الأمر"; updatePreview();
  });

  // swipe-down to close sheet
  let sy = null;
  $("#sheet").addEventListener("touchstart", (e) => { if ($("#sheet").scrollTop <= 0) sy = e.touches[0].clientY; }, { passive: true });
  $("#sheet").addEventListener("touchend", (e) => { if (sy !== null && e.changedTouches[0].clientY - sy > 90) closeSheet(); sy = null; });

  // ── cookies ──
  $("#pasteBtn").addEventListener("click", async () => {
    try { $("#cookies").value = await navigator.clipboard.readText(); } catch { toast("اسمح بالوصول للحافظة أو الصق يدوياً", true); }
  });
  $("#saveCookies").addEventListener("click", async () => {
    const raw = $("#cookies").value.trim(); const note = $("#cookieMsg");
    if (!raw) return toast("الصق الكوكيز أولاً", true);
    const btn = $("#saveCookies"); btn.disabled = true;
    try {
      const r = await api("/api/cookies", { method: "POST", body: { cookies: raw } });
      note.hidden = false;
      if (r.ok) { note.className = "note ok"; note.textContent = `✅ تم حفظ ${r.count} كوكي — البوت يعيد الاتصال الآن`; $("#cookies").value = ""; setTimeout(() => { loadStatus(); loadThreads(); }, 9000); }
      else { note.className = "note bad"; note.textContent = "❌ " + (r.error || "فشل الحفظ"); }
    } catch (e) { note.hidden = false; note.className = "note bad"; note.textContent = e.message; }
    btn.disabled = false;
  });
  $("#restartBtn").addEventListener("click", async () => {
    try { await api("/api/control", { method: "POST", body: { action: "restart" } }); toast("جارٍ إعادة التشغيل…"); setTimeout(loadStatus, 8000); } catch (e) { toast(e.message, true); }
  });

  // ── boot ──
  if (token) api("/api/auth-check").then((r) => r.ok && enter()).catch(() => {});
})();
