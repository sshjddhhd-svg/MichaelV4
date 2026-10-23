/**
 * أمر انسخ: راقب المجموعة، وتحقق من أحدث الرسائل كل 10 ثوانٍ.
 * يستخدم سجل الرسائل الحديث، ويتجنب الرد المكرر على الرسالة ذاتها.
 */
"use strict";

const TEXT = require("../utils/copyMessage");
const CHECK_MS = 10_000;
const HISTORY_LIMIT = 10;

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
      if (typeof api.getThreadHistory !== "function") return done(new Error("getThreadHistory is unavailable"));
      // FCA versions vary slightly; standard callback signature is (threadID, amount, timestamp, callback).
      const returned = api.getThreadHistory(threadID, limit, null, done);
      if (returned && typeof returned.then === "function") returned.then(v => done(null, v), done);
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

function messageKey(msg) {
  if (!msg || typeof msg !== "object") return null;
  const id = msg.messageID ?? msg.messageId ?? msg.message_id ?? msg.id;
  if (id !== undefined && id !== null && String(id)) return String(id);
  const sender = msg.senderID ?? msg.senderId ?? msg.author ?? msg.userID;
  const ts = msg.timestamp ?? msg.createdAt ?? msg.created_at ?? msg.timestampMs;
  const body = msg.body ?? msg.text ?? msg.message ?? "";
  if (sender != null && (ts != null || body)) return `${sender}:${ts ?? ""}:${String(body)}`;
  return null;
}

function senderOf(msg) {
  const value = msg?.senderID ?? msg?.senderId ?? msg?.author ?? msg?.userID ?? msg?.userId;
  return value == null ? "" : String(value);
}

function newestMessage(raw) {
  const messages = normalizeMessages(raw).filter(m => m && typeof m === "object");
  if (!messages.length) return null;
  // APIs may return history newest-first or oldest-first. Prefer numeric timestamps,
  // otherwise use the last returned item, matching the API's conventional ordering.
  const withTime = messages.map((m, index) => ({
    m, index,
    time: Number(m.timestamp ?? m.timestampMs ?? m.createdAt ?? m.created_at ?? 0)
  }));
  if (withTime.some(x => Number.isFinite(x.time) && x.time > 0)) {
    withTime.sort((a, b) => b.time - a.time);
    return withTime[0].m;
  }
  return messages[messages.length - 1];
}

async function getRecentMessages(api, threadID) {
  const raw = await invokeHistory(api, threadID, HISTORY_LIMIT);
  return normalizeMessages(raw);
}

async function sendPlain(api, threadID, text) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (err, result) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve(result);
    };
    try {
      const ret = api.sendMessage(text, threadID, done);
      if (ret && typeof ret.then === "function") ret.then(v => done(null, v), done);
    } catch (err) {
      done(err);
    }
  });
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }



async function startWatch(api, threadID) {
  const tid = String(threadID || "").trim();
  if (!tid) throw new Error("معرّف المجموعة فارغ");
  if (global._copyWatchers.has(tid)) return false;

  const state = {
    busy: false,
    lastObservedKey: null,
    timer: null,
    stopped: false,
    startedAt: Date.now(),
    lastErrorLogAt: 0
  };
  global._copyWatchers.set(tid, state);

  const botID = String(global.GoatBot?.botID || api.getCurrentUserID?.() || "");
  try {
    const initial = await getRecentMessages(api, tid);
    const latest = newestMessage(initial);
    state.lastObservedKey = latest ? messageKey(latest) : null;
  } catch (err) {
    // Do not fail to start if the history endpoint is temporarily unavailable.
    global.log?.warn?.("COPY", `تعذر أخذ خط الأساس للمجموعة ${tid}: ${err?.message || err}`);
  }

  const tick = async () => {
    if (state.stopped || !global._copyWatchers.has(tid) || state.busy) return;
    state.busy = true;
    try {
      const messages = await getRecentMessages(api, tid);
      const latest = newestMessage(messages);
      const key = latest ? messageKey(latest) : null;
      const senderID = senderOf(latest);

      // Log unsupported/empty history so monitoring failures are diagnosable.
      if (!latest || !key || !senderID) {
        const now = Date.now();
        if (now - state.lastErrorLogAt > 30_000) {
          state.lastErrorLogAt = now;
          global.log?.warn?.("COPY", `لا يحتوي سجل المجموعة ${tid} على رسالة قابلة للتعرّف؛ تحقّق من صلاحية getThreadHistory`);
        }
        return;
      }

      if (state.lastObservedKey === null) {
        // First successful read is only a baseline; it is not a new message.
        state.lastObservedKey = key;
        return;
      }
      if (key === state.lastObservedKey) return;

      // Record before waiting to prevent parallel ticks from scheduling duplicates.
      state.lastObservedKey = key;
      if (senderID === botID || !botID) return;

      // Re-check shortly before send: if another person has spoken meanwhile,
      // defer to the most recent message instead of replying to stale content.
      await sleep(REPLY_DELAY_MS);
      if (state.stopped || !global._copyWatchers.has(tid)) return;

      const freshMessages = await getRecentMessages(api, tid);
      const freshLatest = newestMessage(freshMessages);
      const freshKey = freshLatest ? messageKey(freshLatest) : null;
      const freshSender = senderOf(freshLatest);

      if (!freshKey || freshKey !== key || freshSender !== senderID || freshSender === botID) {
        if (freshKey) state.lastObservedKey = freshKey;
        return;
      }

      await sendPlain(api, tid, TEXT);
      global.log?.info?.("COPY", `تم إرسال الرد للمجموعة ${tid} بعد رسالة ${key}`);
    } catch (err) {
      const now = Date.now();
      if (now - state.lastErrorLogAt > 30_000) {
        state.lastErrorLogAt = now;
        global.log?.error?.("COPY", `مشكلة مراقبة ${tid}: ${err?.message || err}`);
      }
    } finally {
      state.busy = false;
    }
  };

  const scheduleNext = async () => {
    await tick();
    if (!state.stopped && global._copyWatchers.has(tid)) {
      state.timer = setTimeout(scheduleNext, CHECK_MS);
    }
  };

  // Run one initial read immediately; subsequent reads every 10 seconds.
  state.timer = setTimeout(scheduleNext, CHECK_MS);
  return true;
}

function stopWatch(threadID) {
  const tid = String(threadID);
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
    description: "يراقب الرسائل كل 10 ثوانٍ وينتظر 10 ثوانٍ قبل إرسال الرد"
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
          ? `✅ المراقبة نشطة للمجموعة ${targetID}. فحص كل 10 ثوانٍ، وانتظار 10 ثوانٍ قبل الرد.`
          : `ℹ️ المراقبة غير نشطة للمجموعة ${targetID}.`
      );
    }

    try {
      const started = await startWatch(api, targetID);
      if (!started) return message.reply(`⚠️ المراقبة تعمل بالفعل للمجموعة ${targetID}.`);
      return message.reply(
        `✅ بدأت مراقبة المجموعة ${targetID}. الفحص كل 10 ثوانٍ والانتظار 10 ثوانٍ قبل الرد على أحدث رسالة جديدة. استخدم /انسخ إيقاف ${targetID} للإيقاف.`
      );
    } catch (err) {
      global.log?.error?.("COPY", err?.message || String(err));
      return message.reply(`❌ تعذر بدء مراقبة المجموعة: ${err?.message || err}`);
    }
  }
};
