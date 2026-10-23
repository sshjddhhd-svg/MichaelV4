/**
 * أمر: انسخ
 * يراقب آخر رسالة في مجموعة محددة كل 10 ثوانٍ ويرسل الرد المحفوظ
 * مرة واحدة فقط عند ظهور رسالة جديدة من شخص آخر.
 */
"use strict";

const TEXT = require("../utils/copyMessage");
const CHECK_MS = 10_000;
const REPLY_DELAY_MS = 10_000;

global._copyWatchers = global._copyWatchers || new Map();

function getLastMessage(api, threadID) {
  return new Promise(resolve => {
    try {
      api.getThreadHistory(threadID, 1, undefined, (err, history) => {
        if (err || !Array.isArray(history) || history.length === 0) {
          return resolve(null);
        }

        const msg = history[history.length - 1];
        if (!msg || !msg.senderID) return resolve(null);

        const senderID = String(msg.senderID);
        const messageID = msg.messageID || msg.messageId || msg.id;
        const timestamp = msg.timestamp || msg.createdAt || "";
        const body = msg.body || msg.text || "";
        const key = messageID
          ? String(messageID)
          : timestamp || body
            ? `${senderID}:${timestamp}:${body}`
            : null;

        resolve({ senderID, key });
      });
    } catch (_) {
      resolve(null);
    }
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sendTypingIndicator(api, threadID) {
  // Show the platform's normal typing indicator when the adapter supports it.
  // This is a user-experience cue, not an attempt to bypass bot detection.
  return new Promise(resolve => {
    try {
      if (typeof api.sendTypingIndicator !== "function") return resolve(false);
      api.sendTypingIndicator(threadID, () => resolve(true));
    } catch (_) {
      resolve(false);
    }
  });
}

async function sendMessage(api, threadID) {
  // Keep a consistent 10-second composing delay before sending the saved reply.
  await sendTypingIndicator(api, threadID);
  await sleep(REPLY_DELAY_MS);
  return new Promise((resolve, reject) => {
    try {
      api.sendMessage(TEXT, threadID, err => err ? reject(err) : resolve());
    } catch (err) {
      reject(err);
    }
  });
}

async function startWatch(api, threadID) {
  const tid = String(threadID);
  if (global._copyWatchers.has(tid)) return false;

  const state = {
    busy: false,
    lastSeenKey: null,
    timer: null,
    startedAt: Date.now()
  };
  global._copyWatchers.set(tid, state);

  // خذ خط أساس عند التشغيل، حتى لا يرد على رسالة قديمة موجودة مسبقاً.
  const baseline = await getLastMessage(api, tid);
  state.lastSeenKey = baseline?.key || null;

  const tick = async () => {
    if (!global._copyWatchers.has(tid) || state.busy) return;
    state.busy = true;

    try {
      const last = await getLastMessage(api, tid);
      // لا تتصرف عند فشل قراءة السجل أو غياب معرّف موثوق.
      if (!last?.key) return;

      // إذا تعذر أخذ خط الأساس عند التشغيل، سجّل أول رسالة مقروءة فقط
      // ولا تعتبرها رسالة جديدة كي لا يُرسل رد على رسالة قديمة.
      if (state.lastSeenKey === null) {
        state.lastSeenKey = last.key;
        return;
      }

      if (last.key === state.lastSeenKey) return;
      state.lastSeenKey = last.key;

      const botID = String(
        global.GoatBot?.botID || api.getCurrentUserID?.() || ""
      );

      // لا ترد على رسائل الحساب نفسه أو على رسائل البوت التي أرسلها.
      if (!botID || last.senderID === botID) return;

      await sendMessage(api, tid);
    } catch (err) {
      global.log?.error?.("COPY", err?.message || String(err));
    } finally {
      state.busy = false;
    }
  };

  const scheduleNext = async () => {
    await tick();
    if (global._copyWatchers.has(tid)) {
      state.timer = setTimeout(scheduleNext, CHECK_MS);
    }
  };

  // أول فحص بعد 10 ثوانٍ، ثم كل 10 ثوانٍ.
  state.timer = setTimeout(scheduleNext, CHECK_MS);
  return true;
}

function stopWatch(threadID) {
  const tid = String(threadID);
  const state = global._copyWatchers.get(tid);
  if (!state) return false;

  clearTimeout(state.timer);
  global._copyWatchers.delete(tid);
  return true;
}

function resolveTarget(args, currentThreadID) {
  const first = String(args?.[0] || "").trim().toLowerCase();
  const action = ["start", "stop", "status", "تشغيل", "إيقاف", "حالة"].includes(first)
    ? first
    : "start";
  const hasAction = action !== "start" || first === "start" || first === "تشغيل";
  const targetArg = hasAction ? args?.[1] : args?.[0];
  return {
    action,
    threadID: String(targetArg || currentThreadID)
  };
}

module.exports = {
  config: {
    name: "انسخ",
    aliases: ["copy"],
    category: "group",
    role: 2,
    description: "يراقب مجموعة كل 10 ثوانٍ وينتظر 10 ثوانٍ قبل إرسال الرد"
  },

  stopWatch,

  onStart: async ({ api, threadID, args = [], message }) => {
    const { action, threadID: targetID } = resolveTarget(args, threadID);

    if (["stop", "إيقاف"].includes(action)) {
      return message.reply(
        stopWatch(targetID)
          ? `🛑 تم إيقاف المراقبة للمجموعة ${targetID}.`
          : `ℹ️ لا توجد مراقبة نشطة للمجموعة ${targetID}.`
      );
    }

    if (["status", "حالة"].includes(action)) {
      const active = global._copyWatchers.has(targetID);
      return message.reply(
        active
          ? `✅ المراقبة نشطة للمجموعة ${targetID} (فحص كل 10 ثوانٍ).`
          : `ℹ️ المراقبة غير نشطة للمجموعة ${targetID}.`
      );
    }

    const started = await startWatch(api, targetID);
    if (!started) {
      return message.reply(`⚠️ المراقبة تعمل بالفعل للمجموعة ${targetID}.`);
    }

    return message.reply(
      `✅ بدأت مراقبة المجموعة ${targetID}. سيتم تجاهل الرسالة الحالية والرد مرة واحدة عند ظهور رسالة جديدة، مع فحص كل 10 ثوانٍ وانتظار 10 ثوانٍ قبل الرد. استخدم /انسخ إيقاف ${targetID} لإيقافها.`
    );
  }
};
