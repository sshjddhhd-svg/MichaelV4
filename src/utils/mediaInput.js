"use strict";

const axios = require("axios");

async function getImageInput(event) {
  const attachments = [
    ...(event?.attachments || []),
    ...(event?.messageReply?.attachments || []),
  ];
  const attachment = attachments.find((item) =>
    ["photo", "image"].includes(String(item?.type || "").toLowerCase()) ||
    item?.url ||
    item?.largePreviewUrl ||
    item?.previewUrl
  );
  if (!attachment) return null;

  // بعض إصدارات FCA تضع البيانات التي تم تنزيلها مسبقاً داخل المرفق.
  if (Buffer.isBuffer(attachment.imageData)) return attachment.imageData;
  if (Buffer.isBuffer(attachment.data)) return attachment.data;

  const url = attachment.url || attachment.largePreviewUrl || attachment.previewUrl;
  if (!url) return null;

  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 30000,
    maxContentLength: 15 * 1024 * 1024,
    headers: {
      "User-Agent": global.config?.userAgent ||
        "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36",
      "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    },
  });
  const image = Buffer.from(response.data);
  if (!image.length) throw new Error("رابط الصورة فارغ");
  return image;
}

module.exports = { getImageInput };