/**
 * أمر انسخ: يفحص أحدث رسالة في المجموعة كل 10 ثوانٍ.
 * إذا كانت أحدث رسالة من عضو وليست من البوت، يرسل الرد مرة واحدة لذلك التحديث.
 * لا ينتظر 10 ثوانٍ إضافية بعد الفحص، ولا يكرر الرد إذا تأخر ظهور رسالة البوت في السجل.
 */
"use strict";

const TEXT = require("../utils/copyMessage");
const CHECK_MS = 10_000;
const HISTORY_LIMIT = 20;

global._copyWatchers = global._copyWatchers || new Map();

function invokeHistory(api, threadID, limit) {
  return new Promise(resolve => {
    let settled = false;
    const done = (err, value) => {
      if (settled) return;
      settled = true;
      resolve(err ? null : value);
    };
    try {
      if (typeof api.getThreadHistory !== "function") {
        return done(new Error("getThreadHistory is unavailable"));
      }
      const returned = api.getThreadHistory(threadID, limit, null, done);
      if (returned && typeof returned.then === "function") {
        returned.then(value => done(null, value), done);
      }
    } catch (err) {
      done(err);
    }
  });
}

function normalizeMessages(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.messages)) return raw.messages;
  if (raw && Array.isArray(raw.threadMessages)) return raw.threadMessages;
  if (raw && Array.isArray(raw.data)) return raw.data;
  return [];
}

function timestampOf(msg) {
  const raw = msg?.timestampMs ?? msg?.timestamp ?? msg?.createdAt ?? msg?.created_at;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const numeric = Number(raw);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function messageKey(msg) {
  if (!msg || typeof msg !== "object") return null;
  const id = msg.messageID ?? msg.messageId ?? msg.message_id ?? msg.id;
  if (id !== undefined && id !== null && String(id)) return String(id);
  const sender = msg.senderID ?? msg.senderId ?? msg.author ?? msg.userID ?? msg.userId;
  const time = timestampOf(msg);
  const body = msg.body ?? msg.text ?? msg.message ?? "";
  if (sender != null && (time || body)) return `${sender}:${time}:${String(body)}`;
  return null;
}

function senderOf(msg) {
  const value = msg?.senderID ?? msg?.senderId ?? msg?.author ?? msg?.userID ?? msg?.userId;
  return value == null ? "" : String(value);
}

function newestMessage(raw) {
  const messages = normalizeMessages(raw).filter(msg => msg && typeof msg === "object");
  if (!messages.length) return null;
  const timed = messages.map((msg, index) => ({ msg, index, time: timestampOf(msg) }));
  if (timed.some(item => item.time > 0)) {
    timed.sort((a, b) => b.time - a.time || b.index - a.index);
    return timed[0].msg;
  }
  // When the API provides no timestamps, FCA's history is commonly newest-first.
  return messages[0];
}

async function getLatest(api, threadID) {
  const raw = await invokeHistory(api, threadID, HISTORY_LIMIT);
  return newestMessage(raw);
}

function sendPlain(api, threadID, text) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (err, result) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve(result);
    };
    let timeout;
    try {
      timeout = setTimeout(() => done(new Error("COPY_SEND_TIMEOUT: no callback within 25 seconds")), 25_000);
      const returned = api.sendMessage(text, threadID, (err, result) => {
        if (timeout) clearTimeout(timeout);
        done(err, result);
      });
      if (returned && typeof returned.then === "function") {
        returned.then(result => {
          if (timeout) clearTimeout(timeout);
          done(null, result);
        }, err => {
          if (timeout) clearTimeout(timeout);
          done(err);
        });
      }
    } catch (err) {
      if (timeout) clearTimeout(timeout);
      done(err);
    }
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function startWatch(api, threadID) {
  const tid = String(threadID || "").trim();
  if (!tid) throw new Error("معرّف المجموعة فارغ");
  if (global._copyWatchers.has(tid)) return false;

  const botValue = global.GoatBot?.botID || api.getCurrentUserID?.();
  const botID = botValue == null ? "" : String(botValue);
  if (!botID) throw new Error("تعذر تحديد معرّف حساب البوت؛ لم تبدأ المراقبة لتجنب الردود الخاطئة");

  const state = {
    busy: false,
    lastObservedKey: null,
    lastRepliedToKey: null,
    timer: null,
    stopped: false,
    startedAt: Date.now(),
    lastErrorLogAt: 0,
    api,
    threadID: tid,
    botID
  };
  global._copyWatchers.set(tid, state);

  try {
    const initial = await getLatest(api, tid);
    state.lastObservedKey = messageKey(initial);
    // Do not reply to messages that existed before monitoring started.
  } catch (err) {
    global.log?.warn?.("COPY", `تعذر أخذ خط الأساس للمجموعة ${tid}: ${err?.message || err}`);
  }

  const tick = async () => {
    if (state.stopped || global._copyWatchers.get(tid) !== state || state.busy) return;
    state.busy = true;
    try {
      const latest = await getLatest(api, tid);
      const key = messageKey(latest);
      const senderID = senderOf(latest);

      if (!latest || !key || !senderID) {
        const now = Date.now();
        if (now - state.lastErrorLogAt >= 30_000) {
          state.lastErrorLogAt = now;
          global.log?.warn?.("COPY", `تعذر تحديد أحدث رسالة في المجموعة ${tid}; تحقق من getThreadHistory`);
        }
        return;
      }

      state.lastObservedKey = key;
      // If our message is latest, the desired condition is already satisfied.
      if (senderID === botID) return;
      // Ignore the same human message if our outgoing message has not appeared
      // in history yet, or if the API returns stale history temporarily.
      if (state.lastRepliedToKey === key) return;

      // Mark before sending so a slow callback or a later tick cannot duplicate it.
      state.lastRepliedToKey = key;
      try {
        await sendPlain(api, tid, TEXT);
        global.log?.info?.("COPY", `تم إرسال الرد للمجموعة ${tid} بعد أحدث رسالة ${key}`);
      } catch (err) {
        // Allow the next poll to retry if the send failed.
        if (state.lastRepliedToKey === key) state.lastRepliedToKey = null;
        throw err;
      }
    } catch (err) {
      const now = Date.now();
      if (now - state.lastErrorLogAt >= 30_000) {
        state.lastErrorLogAt = now;
        global.log?.error?.("COPY", `مشكلة مراقبة ${tid}: ${err?.message || err}`);
      }
    } finally {
      state.busy = false;
    }
  };

  const scheduleNext = async () => {
    await tick();
    if (!state.stopped && global._copyWatchers.get(tid) === state) {
      state.timer = setTimeout(scheduleNext, CHECK_MS);
    }
  };

  // First check after 10 seconds, then one serialized check every 10 seconds.
  state.timer = setTimeout(scheduleNext, CHECK_MS);
  return true;
}

function stopWatch(threadID) {
  const tid = String(threadID || "").trim();
  const state = global._copyWatchers.get(tid);
  if (!state) return false;
  state.stopped = true;
  if (state.timer) clearTimeout(state.timer);
  global._copyWatchers.delete(tid);
  return true;
}

function resolveTarget(args, currentThreadID) {
  const first = String(args?.[0] || "").trim().toLowerCase();
  const actions = ["start", "stop", "status", "تشغيل", "إيقاف", "حالة"];
  const action = actions.includes(first) ? first : "start";
  const hasAction = actions.includes(first);
  const targetArg = hasAction ? args?.[1] : args?.[0];
  return { action, threadID: String(targetArg || currentThreadID || "").trim() };
}

module.exports = {
  config: {
    name: "انسخ",
    aliases: ["copy"],
    category: "group",
    role: 2,
    description: "يفحص أحدث رسالة كل 10 ثوانٍ ويرد مرة واحدة إذا لم تكن من البوت"
  },

  stopWatch,

  onStart: async ({ api, threadID, args = [], message }) => {
    const { action, threadID: targetID } = resolveTarget(args, threadID);
    if (!targetID) return message.reply("❌ لم أستطع تحديد المجموعة.");

    if (["stop", "إيقاف"].includes(action)) {
      return message.reply(
        stopWatch(targetID)
          ? `🛑 تم إيقاف المراقبة للمجموعة ${targetID}.`
          : `ℹ️ لا توجد مراقبة نشطة للمجموعة ${targetID}.`
      );
    }

    if (["status", "حالة"].includes(action)) {
      const state = global._copyWatchers.get(targetID);
      return message.reply(
        state
          ? `✅ المراقبة نشطة للمجموعة ${targetID}. الفحص كل 10 ثوانٍ، والرد مرة واحدة عند كون أحدث رسالة من عضو.`
          : `ℹ️ المراقبة غير نشطة للمجموعة ${targetID}.`
      );
    }

    try {
      const started = await startWatch(api, targetID);
      if (!started) return message.reply(`⚠️ المراقبة تعمل بالفعل للمجموعة ${targetID}.`);
      return message.reply(
        `✅ بدأت مراقبة المجموعة ${targetID}. أفحص أحدث رسالة كل 10 ثوانٍ؛ إذا لم تكن من البوت أرسل الرد مرة واحدة. استخدم /انسخ إيقاف ${targetID} للإيقاف.`
      );
    } catch (err) {
      global.log?.error?.("COPY", err?.message || String(err));
      return message.reply(`❌ تعذر بدء مراقبة المجموعة: ${err?.message || err}`);
    }
  }
};
