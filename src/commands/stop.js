/** أمر: توقف — يوقف أمر النسخ بالغروب الحالي */
"use strict";
module.exports = {
  config: { name: "توقف", aliases: ["stop"], category: "group", role: 2, description: "يوقف أمر النسخ بهذا الغروب" },
  onStart: async ({ threadID, message }) => {
    const ok = require("./copy").stopWatch(threadID);
    return message.reply(ok ? "تم ايقاف المراقبة بهذه المجموعة" : "لا توجد مراقبة نشطة بهذه المجموعة");
  },
};
