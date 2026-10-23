
/**
 * أمر: انسخ
 * يفحص آخر رسالة في المجموعة كل 10 ثوانٍ.
 * يرسل الرسالة المحفوظة مرة واحدة لكل رسالة جديدة يتمكن من تحديدها.
 */
"use strict";

const TEXT = require("../utils/copyMessage");
const CHECK_MS = 10000;

global._copyWatchers = global._copyWatchers || new Map();

function getLastMessage(api, threadID) {
  return new Promise(resolve => {
    try {
      api.getThreadHistory(threadID, 1, undefined, (err, history) => {
        if (err || !Array.isArray(history) || history.length === 0) {
          return resolve(null);
        }

        const msg = history[history.length - 1];

        if (!msg || !msg.senderID) {
          return resolve(null);
        }

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
    } catch (err) {
      resolve(null);
    }
  });
}

function sendMessage(api, threadID) {
  return new Promise((resolve, reject) => {
    try {
      api.sendMessage(TEXT, threadID, err => {
        if (err) return reject(err);
        resolve();
      });
    } catch (err) {
      reject(err);
    }
  });
}

function startWatch(api, threadID) {
  const tid = String(threadID);

  if (global._copyWatchers.has(tid)) {
    return false;
  }

  const state = {
    busy: false,
    lastHandledKey: null,
    timer: null
  };

  const tick = async () => {
    if (!global._copyWatchers.has(tid)) return;

    if (!state.busy) {
      state.busy = true;

      try {
        const botID = String(
          global.GoatBot?.botID ||
          api.getCurrentUserID?.() ||
          ""
        );

        const last = await getLastMessage(api, tid);

        // لا ترسل عند فشل قراءة السجل أو تعذر تحديد الرسالة.
        if (!last || !last.key) {
          return;
        }

        // سجّل رسالة البوت حتى لا يعاد التعامل معها.
        if (last.senderID === botID) {
          state.lastHandledKey = last.key;
          return;
        }

        // لا تعاود إرسال الرد بسبب بقاء الرسالة نفسها في السجل.
        if (last.key === state.lastHandledKey) {
          return;
        }

        // سجّل الرسالة قبل الإرسال لمنع التكرار.
        state.lastHandledKey = last.key;

        await sendMessage(api, tid);
      } catch (err) {
        global.log?.error?.(
          "COPY",
          err.message || String(err)
        );
      } finally {
        state.busy = false;
      }
    }
  };

  global._copyWatchers.set(tid, state);

  const scheduleNext = async () => {
    await tick();

    if (global._copyWatchers.has(tid)) {
      state.timer = setTimeout(scheduleNext, CHECK_MS);
    }
  };

  state.timer = setTimeout(scheduleNext, 500);

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

module.exports = {
  config: {
    name: "انسخ",
    aliases: ["copy"],
    category: "group",
    role: 2,
    description:
      "يراقب آخر رسالة كل 10 ثوانٍ ويمنع تكرار الرد على الرسالة نفسها"
  },

  stopWatch,

  onStart: async ({ api, threadID, message }) => {
    if (!startWatch(api, threadID)) {
      return message.reply(
        "⚠️ أمر النسخ يعمل بالفعل في هذه المجموعة."
      );
    }

    return message.reply(
      "✅ تم تشغيل مراقبة الرسائل."
    );
  }
};
