"use strict";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

module.exports = {
  config: {
    name: "احذف",
    aliases: ["unsend", "del"],
    description: "حذف رسالة مُردّ عليها، أو حذف آخر N رسالة",
    usage: "احذف  (ردّ على رسالة)  |  احذف [عدد]",
    role: 2,
    ownerOnly: false,
    category: "admin",
  },

  async run({ api, event, args, threadID }) {
    const count = parseInt(args[0], 10);

    // ── وضع الردّ: حذف رسالة واحدة مُحدَّدة ────────────────────────────────
    if (!count || isNaN(count)) {
      const reply = event.messageReply;
      if (!reply) {
        return api.sendMessage(
          "⚠️ ردّ على الرسالة التي تريد حذفها، أو:\nاحذف [عدد] — لحذف آخر N رسالة",
          threadID
        );
      }

      try {
        await new Promise((res, rej) =>
          api.unsendMessage(reply.messageID, (e) => (e ? rej(e) : res()))
        );
      } catch (e) {
        api.sendMessage(`❌ فشل الحذف: ${e?.message || e}`, threadID);
      }
      return;
    }

    // ── وضع الكمية: حذف آخر N رسالة بطريقة بشرية ──────────────────────────
    const limit = Math.min(Math.max(count, 1), 50);

    let history;
    try {
      history = await new Promise((res, rej) =>
        api.getThreadHistory(threadID, limit + 10, null, (e, d) => (e ? rej(e) : res(d)))
      );
    } catch (e) {
      return api.sendMessage(`❌ فشل جلب سجل الرسائل: ${e?.message || e}`, threadID);
    }

    if (!history || !history.length) {
      return api.sendMessage("❌ لا توجد رسائل لحذفها.", threadID);
    }

    // استبعاد رسالة الأمر الحالية، خذ الأحدث أولاً
    const msgs = history
      .filter((m) => m.messageID && m.messageID !== event.messageID)
      .slice(-limit)
      .reverse();

    if (!msgs.length) {
      return api.sendMessage("❌ لا توجد رسائل كافية للحذف.", threadID);
    }

    let deleted = 0;
    let failed  = 0;

    for (const msg of msgs) {
      // تأخير عشوائي بشري بين كل حذف (0.8s – 2.2s)
      await sleep(randInt(800, 2200));

      try {
        await new Promise((res, rej) =>
          api.unsendMessage(msg.messageID, (e) => (e ? rej(e) : res()))
        );
        deleted++;
      } catch (_) {
        failed++;
      }

      // استراحة إضافية كل 5 رسائل لتجنب الكشف
      if ((deleted + failed) % 5 === 0) {
        await sleep(randInt(1500, 3500));
      }
    }

    if (deleted === 0) {
      api.sendMessage(
        `⚠️ لم أتمكن من حذف أي رسالة.\nتأكد من أن البوت يعمل عبر MQTT وأن الرسائل من حسابه.`,
        threadID
      );
    }
    // لا نرسل رسالة تأكيد عند النجاح — الحذف يتكلم عن نفسه
  },
};
