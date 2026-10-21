/**
 * أمر: انسخ
 * يراقب الغروب كل 10 ثواني، وإذا آخر رسالة مو من البوت يرسل الرسالة المحفوظة
 * مع مؤشر كتابة بشري.
 */
"use strict";
const TEXT = require("../utils/copyMessage");
const CHECK_MS = 10000;

global._copyWatchers = global._copyWatchers || new Map();

const sleep = ms => new Promise(r => setTimeout(r, ms));

function getLastSender(api, threadID) {
  return new Promise(resolve => {
    try {
      api.getThreadHistory(threadID, 1, undefined, (err, history) => {
        if (err || !Array.isArray(history) || !history.length) return resolve(null);
        resolve(String(history[history.length - 1].senderID || ""));
      });
    } catch (_) { resolve(null); }
  });
}

async function sendHuman(api, threadID) {
  // تأخير بشري قصير قبل البدء بالكتابة
  await sleep(800 + Math.floor(Math.random() * 1700));
  const delay = global.utils?.calcHumanTypingDelay?.(TEXT) || 4000;
  try { await global.utils?.simulateTyping?.(api, threadID, delay); } catch (_) {}
  await new Promise(res => api.sendMessage(TEXT, threadID, () => res()));
}

function startWatch(api, threadID) {
  const tid = String(threadID);
  if (global._copyWatchers.has(tid)) return false;
  const state = { busy: false, lastOther: Date.now(), timer: null };

  const tick = async () => {
    if (!global._copyWatchers.has(tid)) return;
    if (!state.busy) {
      state.busy = true;
      try {
        const botID = String(global.GoatBot?.botID || api.getCurrentUserID?.() || "");
        let last = await getLastSender(api, tid);
        // إذا فشل قراءة السجل، نعتمد على آخر رسالة شافها البوت من غيره
        if (last === null) last = state.otherPending ? "other" : botID;
        if (last && last !== botID) {
          state.otherPending = false;
          await sendHuman(api, tid);
        }
      } catch (e) { global.log?.error?.("COPY", e.message || String(e)); }
      state.busy = false;
    }
    // فترة 10 ثواني مع تذبذب بسيط حتى لا يبين كروبوت
    state.timer = setTimeout(tick, CHECK_MS + Math.floor(Math.random() * 1500));
  };

  global._copyWatchers.set(tid, state);
  state.timer = setTimeout(tick, 500);
  return true;
}

function stopWatch(threadID) {
  const tid = String(threadID);
  const st = global._copyWatchers.get(tid);
  if (!st) return false;
  clearTimeout(st.timer);
  global._copyWatchers.delete(tid);
  return true;
}

module.exports = {
  config: {
    name: "انسخ",
    aliases: ["copy"],
    category: "group",
    role: 2,
    description: "يخلي آخر رسالة بالغروب دائماً للبوت (فحص كل 10 ثواني)",
  },
  stopWatch,
  onEvent: async ({ event }) => {
    const st = global._copyWatchers.get(String(event?.threadID));
    if (st && event.senderID && String(event.senderID) !== String(global.GoatBot?.botID)) st.otherPending = true;
  },
  onStart: async ({ api, threadID, message }) => {
    if (!startWatch(api, threadID)) return message.reply("⚠️ أمر النسخ شغال أصلاً بهذا الغروب.");
    // الرسالة الأولى ترسل فوراً بالفحص الأول لأن آخر رسالة هي أمر المستخدم
  },
};
