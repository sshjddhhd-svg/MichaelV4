"use strict";

const sleep   = (ms) => new Promise((r) => setTimeout(r, ms));
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const POLL_MS      = 8000;  // فحص احتياطي كل 8 ثوانٍ
const RESTORE_COOL = 2500;  // لا نبدأ إعادة جديدة إذا بدأت منذ أقل من 2.5 ث
const MAX_TRIES    = 5;     // عدد محاولات الإعادة عند كل اكتشاف

// ─── حارس الإعادة — مبني على وقت لا على boolean ─────────────────────────────
function _isRestoring(threadID) {
  const t = global._nameRestoringAt?.get(threadID);
  return !!t && (Date.now() - t) < RESTORE_COOL;
}
function _markRestoring(threadID) {
  if (!global._nameRestoringAt) global._nameRestoringAt = new Map();
  global._nameRestoringAt.set(threadID, Date.now());
}
function _unmarkRestoring(threadID) {
  global._nameRestoringAt?.delete(threadID);
}

// ─── محرك الإعادة مع إعادة المحاولة ─────────────────────────────────────────
async function _doRestore(threadID, lockedName) {
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    const api = global._nameApis?.get(threadID);
    if (!api) { await sleep(2000); continue; }
    if (!global._lockedNames?.has(threadID)) return; // أُلغي القفل

    try {
      await new Promise((res, rej) =>
        api.setTitle(lockedName, threadID, (e) => (e ? rej(e) : res()))
      );
      return; // نجحت
    } catch (_) {
      if (attempt < MAX_TRIES) await sleep(1500 * attempt); // backoff تصاعدي
    }
  }
}

// ─── نافذة مراقبة خارجية (تُصدَّر للـ handler) ───────────────────────────────
global._nameOps = { _isRestoring, _markRestoring, _unmarkRestoring, _doRestore };

// ─── Poller الاحتياطي ────────────────────────────────────────────────────────
function startNamePoller(threadID) {
  if (!global._namePollers)     global._namePollers     = new Map();
  if (!global._lockedNames)     global._lockedNames     = new Map();
  if (!global._nameRestoringAt) global._nameRestoringAt = new Map();

  // أوقف القديم أولاً
  if (global._namePollers.has(threadID)) {
    clearInterval(global._namePollers.get(threadID));
    global._namePollers.delete(threadID);
  }

  const id = setInterval(async () => {
    try {
      const api = global._nameApis?.get(threadID);
      if (!api) return;

      // القفل أُزيل → أوقف الـ poller
      if (!global._lockedNames?.has(threadID)) {
        clearInterval(id);
        global._namePollers?.delete(threadID);
        return;
      }

      // إعادة جارية من الـ event handler → لا تتدخل
      if (_isRestoring(threadID)) return;

      const lockedName = global._lockedNames.get(threadID);
      if (!lockedName) return;

      // اجلب اسم المجموعة الحالي
      const info = await new Promise((res, rej) =>
        api.getThreadInfo(threadID, (e, d) => (e ? rej(e) : res(d)))
      );
      const current = String(info?.threadName || "").trim();
      if (current === lockedName) return; // الاسم صحيح ✓

      // اكتُشف تغيير → أعده بعد تأخير عشوائي 2-5 ث
      _markRestoring(threadID);
      await sleep(randInt(2000, 5000));

      if (!global._lockedNames?.has(threadID)) { _unmarkRestoring(threadID); return; }
      await _doRestore(threadID, lockedName);
      _unmarkRestoring(threadID);

    } catch (_) {
      _unmarkRestoring(threadID);
    }
  }, POLL_MS);

  global._namePollers.set(threadID, id);
}

// ─── الأمر الرئيسي ────────────────────────────────────────────────────────────
module.exports = {
  config: {
    name:        "اسم",
    aliases:     [],
    description: "قفل اسم المجموعة وإعادته تلقائياً عند أي تغيير",
    usage:       "اسم [الاسم] | اسم ايقاف",
    role:        2,
    ownerOnly:   false,
    category:    "group",
  },

  async run({ api, args, threadID }) {
    if (!global._lockedNames)     global._lockedNames     = new Map();
    if (!global._namePollers)     global._namePollers     = new Map();
    if (!global._nameRestoringAt) global._nameRestoringAt = new Map();
    if (!global._nameApis) global._nameApis = new Map();
    global._nameApis.set(threadID, api);

    const sub = (args[0] || "").trim();

    // ── إيقاف القفل ──────────────────────────────────────────────────────────
    if (sub === "ايقاف") {
      if (!global._lockedNames.has(threadID))
        return api.sendMessage("❌ لا يوجد قفل اسم نشط في هذه المجموعة.", threadID);

      global._lockedNames.delete(threadID);
      _unmarkRestoring(threadID);
      if (global._namePollers.has(threadID)) {
        clearInterval(global._namePollers.get(threadID));
        global._namePollers.delete(threadID);
      }
      return api.sendMessage("✅ تم إيقاف قفل اسم المجموعة.", threadID);
    }

    // ── التحقق من الاسم ───────────────────────────────────────────────────────
    const newName = args.join(" ").trim();
    if (!newName)
      return api.sendMessage(
        "⚠️ استخدم:\n• اسم [الاسم] — قفل الاسم\n• اسم ايقاف — إيقاف القفل",
        threadID
      );

    // محاكاة كتابة بشرية
    try { api.sendTypingIndicator(threadID); } catch (_) {}
    await sleep(randInt(800, 1800));

    // تغيير الاسم الفعلي
    try {
      await new Promise((res, rej) =>
        api.setTitle(newName, threadID, (e) => (e ? rej(e) : res()))
      );
    } catch (e) {
      return api.sendMessage(`❌ فشل تغيير الاسم: ${e.message || e}`, threadID);
    }

    // حفظ القفل + تشغيل المراقبة
    global._lockedNames.set(threadID, newName);
    startNamePoller(threadID);

    api.sendMessage(
      `✅ تم تغيير اسم المجموعة إلى:\n"${newName}"\n\n🔒 الاسم مقفل — سيُعاد خلال 2-5 ثوانٍ عند أي تغيير.\nلإيقاف القفل: اسم ايقاف`,
      threadID
    );
  },
};

module.exports.startNamePoller    = startNamePoller;
module.exports._doRestore         = _doRestore;
module.exports._isRestoring       = _isRestoring;
module.exports._markRestoring     = _markRestoring;
module.exports._unmarkRestoring   = _unmarkRestoring;
