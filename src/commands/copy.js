/**
 * أمر انسخ: يرسل نص الرد تلقائياً كل 20–35 ثانية، على غرار MichaelVbita.
 * أمر توقف يلغي المؤقت الخاص بالمحادثة الحالية.
 */
"use strict";

const AUTO_MSG = require("../utils/copyMessage");
const MIN_DELAY_MS = 20_000;
const MAX_DELAY_MS = 35_000;
const MIN_TYPING_MS = 2_000;
const MAX_TYPING_MS = 5_000;

global._dracarysAutoJobs = global._dracarysAutoJobs || new Map();

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isActive(threadID, state) {
  return global._dracarysAutoJobs?.get(threadID) === state && !state.stopped;
}

function stopWatch(threadID) {
  const tid = String(threadID || "").trim();
  const jobs = global._dracarysAutoJobs;
  const state = jobs?.get(tid);
  if (!state) return false;

  state.stopped = true;
  if (state.timer) clearTimeout(state.timer);
  if (state.typingTimer) clearTimeout(state.typingTimer);
  jobs.delete(tid);
  return true;
}

function sendMessage(api, threadID, text) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (err, result) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve(result);
    };

    let timer;
    try {
      timer = setTimeout(() => done(new Error("AUTO_COPY_SEND_TIMEOUT")), 25_000);
      const returned = api.sendMessage(text, threadID, (err, result) => {
        clearTimeout(timer);
        done(err, result);
      });
      if (returned && typeof returned.then === "function") {
        returned.then(
          result => { clearTimeout(timer); done(null, result); },
          err => { clearTimeout(timer); done(err); }
        );
      }
    } catch (err) {
      if (timer) clearTimeout(timer);
      done(err);
    }
  });
}

async function scheduleNext(api, threadID, state) {
  if (!isActive(threadID, state)) return;
  state.timer = setTimeout(async () => {
    if (!isActive(threadID, state)) return;

    try {
      if (typeof api.sendTypingIndicator === "function") {
        try {
          api.sendTypingIndicator(threadID);
        } catch (_) {}
      }

      await sleep(randomInt(MIN_TYPING_MS, MAX_TYPING_MS));
      if (!isActive(threadID, state)) return;

      await sendMessage(api, threadID, AUTO_MSG);
    } catch (err) {
      global.log?.warn?.("COPY", `تعذر إرسال الرسالة التلقائية في ${threadID}: ${err?.message || err}`);
    } finally {
      if (isActive(threadID, state)) scheduleNext(api, threadID, state);
    }
  }, randomInt(MIN_DELAY_MS, MAX_DELAY_MS));
}

function startWatch(api, threadID) {
  const tid = String(threadID || "").trim();
  if (!tid) throw new Error("معرّف المحادثة فارغ");
  if (global._dracarysAutoJobs.has(tid)) return false;

  const state = { timer: null, typingTimer: null, stopped: false };
  global._dracarysAutoJobs.set(tid, state);
  scheduleNext(api, tid, state);
  return true;
}

module.exports = {
  config: {
    name: "انسخ",
    aliases: ["copy"],
    category: "group",
    role: 2,
    description: "يرسل الرسالة تلقائياً كل 20–35 ثانية"
  },

  stopWatch,

  onStart: async ({ api, threadID, args = [], message }) => {
    const first = String(args[0] || "").trim().toLowerCase();

    if (["stop", "إيقاف", "توقف"].includes(first)) {
      return stopWatch(threadID)
        ? message.reply("تم ايقاف المراقبة بهذه المجموعة")
        : message.reply("لا توجد مراقبة نشطة بهذه المجموعة");
    }

    if (["status", "حالة"].includes(first)) {
      return message.reply(
        global._dracarysAutoJobs.has(String(threadID))
          ? "الإرسال التلقائي نشط بهذه المجموعة"
          : "الإرسال التلقائي متوقف بهذه المجموعة"
      );
    }

    try {
      const started = startWatch(api, threadID);
      if (!started) return message.reply("الإرسال التلقائي يعمل بالفعل بهذه المجموعة");
      return message.reply("تم تفعيل مراقبة المجموعة");
    } catch (err) {
      global.log?.error?.("COPY", err?.message || String(err));
      return message.reply("تعذر تفعيل الإرسال التلقائي بهذه المجموعة");
    }
  }
};
