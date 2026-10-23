"use strict";

const { getImageInput } = require("../utils/mediaInput");

module.exports = {
  config: {
    name: "صورة",
    aliases: ["صورةالمجموعة", "صوره"],
    description: "تغيير صورة المجموعة عبر الرد على صورة",
    usage: "صورة (رد على صورة)",
    role: 2,
    ownerOnly: false,
    category: "group",
  },

  async run({ api, event, threadID }) {
    const image = await getImageInput(event);
    if (!image) {
      return api.sendMessage("⚠️ ردّ على صورة لاستخدامها كصورة للمجموعة.", threadID);
    }

    try {
      await new Promise((resolve, reject) =>
        api.changeGroupImage(image, threadID, (error) => error ? reject(error) : resolve())
      );
      return api.sendMessage("✅ تم تغيير صورة المجموعة.", threadID);
    } catch (error) {
      return api.sendMessage(`❌ فشل تغيير صورة المجموعة: ${error?.message || error}`, threadID);
    }
  },
};