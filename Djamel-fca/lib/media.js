/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║   Djamel-FCA — Media Helpers v1.0                                  ║
 * ║   إرسال الصور والفيديوهات والصوت من URL مباشرة                    ║
 * ║   Copyright © 2025 DJAMEL — Djamel-Fca Architecte Core                               ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * الاستخدام في الأوامر:
 *   const { sendPhoto, sendVideo, sendAudio, sendFile, cobaltDownload } = require("../../Djamel-fca/lib/media");
 *
 *   await sendPhoto(api, "https://example.com/img.jpg", "وصف الصورة", event.threadID);
 *   await sendVideo(api, "https://example.com/vid.mp4", "عنوان الفيديو", event.threadID);
 *   await sendAudio(api, "https://example.com/aud.mp3", "اسم الأغنية", event.threadID);
 *
 * أو عبر api.djamel مباشرة:
 *   await api.djamel.sendPhoto(url, caption, threadID);
 */
"use strict";

const axios   = require("axios");
const fs      = require("fs-extra");
const path    = require("path");
const os      = require("os");

const TMP = path.join(os.tmpdir(), "djamel_fca_media");
fs.ensureDirSync(TMP);

const UA = "Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

// ── مساعد: تحديد الامتداد من MIME أو URL ─────────────────────────────────────
function guessExt(contentType, url, fallback = "bin") {
  const mimeMap = {
    "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png",
    "image/gif": "gif",  "image/webp": "webp", "image/bmp": "bmp",
    "video/mp4": "mp4",  "video/webm": "webm", "video/quicktime": "mov",
    "video/x-matroska": "mkv", "video/3gpp": "3gp",
    "audio/mpeg": "mp3", "audio/mp4": "m4a",  "audio/ogg": "ogg",
    "audio/wav": "wav",  "audio/webm": "webm", "audio/aac": "aac",
    "application/pdf": "pdf",
  };
  if (contentType) {
    const base = contentType.split(";")[0].trim().toLowerCase();
    if (mimeMap[base]) return mimeMap[base];
  }
  if (url) {
    const m = url.split("?")[0].match(/\.([a-zA-Z0-9]{2,5})$/);
    if (m) return m[1].toLowerCase();
  }
  return fallback;
}

// ── تنزيل stream مباشر من URL (للاستخدام في attachment) ─────────────────────
/**
 * يرجع readable stream جاهز للإرسال كـ attachment
 * stream.path مضبوط تلقائياً لكي يعرف الـ FCA نوع الملف
 */
async function downloadStream(url, options = {}) {
  const res = await axios.get(url, {
    responseType: "stream",
    timeout: options.timeout || 60000,
    maxRedirects: 10,
    headers: {
      "User-Agent": options.ua || UA,
      "Accept":     "*/*",
      ...(options.headers || {}),
    },
  });
  const ct  = res.headers["content-type"] || "";
  const ext = guessExt(ct, url, options.fallbackExt || "bin");
  res.data.path = `djamel_fca_media_${Date.now()}.${ext}`;
  return res.data;
}

// ── تنزيل إلى ملف مؤقت ───────────────────────────────────────────────────────
async function downloadToFile(url, ext, options = {}) {
  const outPath = path.join(TMP, `core_${Date.now()}.${ext}`);
  const res     = await axios.get(url, {
    responseType: "arraybuffer",
    timeout:      options.timeout || 90000,
    maxRedirects: 10,
    headers: {
      "User-Agent": options.ua || UA,
      ...(options.headers || {}),
    },
  });
  await fs.outputFile(outPath, Buffer.from(res.data));
  return outPath;
}

// ── إرسال صورة من URL ────────────────────────────────────────────────────────
/**
 * @param {object} api       — FCA api object
 * @param {string} url       — رابط الصورة
 * @param {string} caption   — نص مع الصورة
 * @param {string} threadID  — معرف المحادثة
 * @param {object} opts      — خيارات إضافية: { replyToMessageID, timeout }
 */
async function sendPhoto(api, url, caption, threadID, opts = {}) {
  const stream = await downloadStream(url, { fallbackExt: "jpg", timeout: opts.timeout });
  return api.sendMessage(
    { body: caption || "", attachment: stream },
    threadID,
    opts.replyToMessageID
  );
}

// ── إرسال فيديو من URL ───────────────────────────────────────────────────────
/**
 * ملاحظة: الفيديوهات الكبيرة تحتاج تنزيل للملف أولاً
 * @param {object} api
 * @param {string} url
 * @param {string} caption
 * @param {string} threadID
 * @param {object} opts  — { replyToMessageID, timeout, useFile: true لتنزيل ملف كامل }
 */
async function sendVideo(api, url, caption, threadID, opts = {}) {
  if (opts.useFile) {
    // تنزيل كامل إلى ملف مؤقت (للفيديوهات الكبيرة)
    const filePath = await downloadToFile(url, "mp4", { timeout: opts.timeout || 120000 });
    try {
      const result = await api.sendMessage(
        { body: caption || "", attachment: fs.createReadStream(filePath) },
        threadID,
        opts.replyToMessageID
      );
      return result;
    } finally {
      fs.remove(filePath).catch(() => {});
    }
  }
  const stream = await downloadStream(url, { fallbackExt: "mp4", timeout: opts.timeout || 120000 });
  return api.sendMessage(
    { body: caption || "", attachment: stream },
    threadID,
    opts.replyToMessageID
  );
}

// ── إرسال صوت/موسيقى من URL ──────────────────────────────────────────────────
async function sendAudio(api, url, caption, threadID, opts = {}) {
  const filePath = await downloadToFile(url, opts.ext || "mp3", { timeout: opts.timeout || 90000 });
  try {
    const result = await api.sendMessage(
      { body: caption || "", attachment: fs.createReadStream(filePath) },
      threadID,
      opts.replyToMessageID
    );
    return result;
  } finally {
    fs.remove(filePath).catch(() => {});
  }
}

// ── إرسال ملف عام من URL (PDF، ZIP، إلخ) ────────────────────────────────────
async function sendFile(api, url, filename, caption, threadID, opts = {}) {
  const ext      = path.extname(filename || url.split("?")[0]).replace(".", "") || "bin";
  const filePath = await downloadToFile(url, ext, { timeout: opts.timeout || 60000 });
  try {
    const stream  = fs.createReadStream(filePath);
    stream.path   = filename || path.basename(filePath);
    const result  = await api.sendMessage(
      { body: caption || "", attachment: stream },
      threadID,
      opts.replyToMessageID
    );
    return result;
  } finally {
    fs.remove(filePath).catch(() => {});
  }
}

// ── إرسال عدة صور دفعة واحدة ────────────────────────────────────────────────
/**
 * @param {object} api
 * @param {string[]} urls    — قائمة روابط الصور (حد أقصى 6)
 * @param {string} caption
 * @param {string} threadID
 */
async function sendMultiPhoto(api, urls, caption, threadID, opts = {}) {
  const limited = urls.slice(0, 6);
  const streams = await Promise.all(
    limited.map(url => downloadStream(url, { fallbackExt: "jpg" }).catch(() => null))
  );
  const valid = streams.filter(Boolean);
  if (!valid.length) throw new Error("djamel-fca.media: لم يتم تنزيل أي صورة");
  return api.sendMessage(
    { body: caption || "", attachment: valid },
    threadID,
    opts.replyToMessageID
  );
}

// ── cobalt.tools — تنزيل من مواقع التواصل (TikTok, Instagram, YouTube, X…) ──
/**
 * يرجع رابط التنزيل المباشر لأي رابط من مواقع التواصل الاجتماعي
 * مصدره من WHITE-V3 instagram.js (cobalt.tools هو API مفتوح المصدر)
 *
 * @param {string} url          — رابط المنشور/الفيديو
 * @param {object} opts         — { audioOnly: false, quality: "720", codec: "h264" }
 * @returns {Promise<string>}   — رابط التنزيل المباشر
 */
async function cobaltDownload(url, opts = {}) {
  const res = await axios.post(
    "https://api.cobalt.tools/",
    {
      url,
      vCodec:          opts.codec        || "h264",
      vQuality:        opts.quality      || "720",
      filenamePattern: "classic",
      isAudioOnly:     opts.audioOnly    || false,
      isNoTTWatermark: opts.noWatermark  ?? true,   // بدون علامة مائية TikTok
    },
    {
      timeout: 25000,
      headers: {
        "Accept":       "application/json",
        "Content-Type": "application/json",
        "User-Agent":   UA,
      },
    }
  );

  const d = res.data;
  if (!d)                   throw new Error("cobalt: استجابة فارغة");
  if (d.status === "error") throw new Error("cobalt: " + (d.text || "خطأ غير معروف"));

  // picker — اختر أول فيديو
  if (d.status === "picker" && d.picker?.length) {
    const vid = d.picker.find(p => p.type === "video") || d.picker[0];
    if (vid?.url) return vid.url;
    throw new Error("cobalt: picker بدون رابط");
  }

  if (d.url) return d.url;
  throw new Error("cobalt: لا يوجد رابط (status=" + d.status + ")");
}

// ── cobalt + إرسال مباشر ────────────────────────────────────────────────────
/**
 * تنزيل من رابط سوشيال ميديا وإرساله في المحادثة مباشرة
 * يدعم: TikTok, Instagram, YouTube, Twitter/X, Facebook…
 */
async function sendFromSocial(api, socialUrl, caption, threadID, opts = {}) {
  const directUrl = await cobaltDownload(socialUrl, opts);
  if (opts.audioOnly) {
    return sendAudio(api, directUrl, caption, threadID, opts);
  }
  return sendVideo(api, directUrl, caption, threadID, { ...opts, useFile: true });
}

// ── تنظيف ملفات TMP القديمة (أكبر من ساعة) ──────────────────────────────────
function cleanOldTmp(maxAgeMs = 60 * 60 * 1000) {
  try {
    const files = fs.readdirSync(TMP);
    const now   = Date.now();
    for (const f of files) {
      try {
        const fp   = path.join(TMP, f);
        const stat = fs.statSync(fp);
        if (now - stat.mtimeMs > maxAgeMs) fs.removeSync(fp);
      } catch (_) {}
    }
  } catch (_) {}
}

// تنظيف تلقائي كل 30 دقيقة
setInterval(cleanOldTmp, 30 * 60 * 1000);

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = {
  downloadStream,
  downloadToFile,
  sendPhoto,
  sendVideo,
  sendAudio,
  sendFile,
  sendMultiPhoto,
  cobaltDownload,
  sendFromSocial,
  guessExt,
  cleanOldTmp,
  TMP_DIR: TMP,
};
