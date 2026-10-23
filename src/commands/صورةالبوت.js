"use strict";

const { getImageInput } = require("../utils/mediaInput");

module.exports = {
  config: {
    name: "صورةالبوت",
    aliases: ["صورهالبوت", "صورة_البوت"],
    description: "تغيير صورة حساب البوت عبر الرد على صورة",
    usage: "صورةالبوت (رد على صورة)",
    role: 2,
    ownerOnly: false,
    category: "admin",
  },

  async run({ api, event, threadID }) {
    const image = await getImageInput(event);
    if (!image) {
      return api.sendMessage("⚠️ ردّ على صورة لاستخدامها كصورة لحساب البوت.", threadID);
    }

    const changeAvatar = api.changeAvatar || api.changeProfilePicture;
    if (typeof changeAvatar !== "function") {
      return api.sendMessage("❌ مكتبة الاتصال الحالية لا تدعم تغيير صورة الحساب.", threadID);
    }

    try {
      await new Promise((resolve, reject) =>
        changeAvatar.call(api, image, (error) => error ? reject(error) : resolve())
      );
      return api.sendMessage("✅ تم تغيير صورة حساب البوت.", threadID);
    } catch (error) {
      return api.sendMessage(`❌ فشل تغيير صورة الحساب: ${error?.message || error}`, threadID);
    }
  },
};