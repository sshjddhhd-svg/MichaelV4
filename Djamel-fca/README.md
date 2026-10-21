# Djamel-FCA v4.0 — Djamel-Fca Architecte

مكتبة Facebook Client Abstractions لبوت Djamel-Fca Architecte V1.

---

## الميزات

| الميزة | الوصف |
|--------|-------|
| 🍪 Cookie Parser | يدعم 5 صيغ: JSON Array, c3c, Netscape, Header String, Object |
| ✅ Session Validator | فحص الكوكيز مباشرة عبر mbasic.facebook.com |
| 🤖 Human Behavior | تأخير typing بشري، تدوير User-Agent |
| 📦 Thread Cache | تخزين مؤقت لمعلومات المجموعات |
| 📸 Media Helpers | إرسال صور/فيديوهات/صوت من URL مباشرة |
| 🌐 Cobalt Download | تنزيل من TikTok/Instagram/YouTube/Twitter بـ API مجاني |

---

## الاستخدام — Media Helpers

```js
const { sendPhoto, sendVideo, sendAudio, sendFromSocial, cobaltDownload } = require("./Djamel-fca/lib/media");

// ── إرسال صورة من رابط ──
await sendPhoto(api, "https://example.com/image.jpg", "وصف الصورة", event.threadID);

// ── إرسال فيديو من رابط ──
await sendVideo(api, "https://example.com/video.mp4", "عنوان الفيديو", event.threadID);

// ── إرسال صوت/موسيقى ──
await sendAudio(api, "https://example.com/song.mp3", "اسم الأغنية", event.threadID);

// ── إرسال عدة صور دفعة واحدة (max 6) ──
const { sendMultiPhoto } = require("./Djamel-fca/lib/media");
await sendMultiPhoto(api, [url1, url2, url3], "صور متعددة", event.threadID);

// ── تنزيل من TikTok/Instagram/YouTube وإرساله مباشرة ──
await sendFromSocial(api, "https://www.tiktok.com/@user/video/xxx", "عنوان الفيديو", event.threadID);

// ── فقط الصوت (MP3) من يوتيوب ──
await sendFromSocial(api, "https://youtu.be/xxx", "اسم الأغنية", event.threadID, { audioOnly: true });

// ── الحصول على رابط مباشر فقط ──
const directUrl = await cobaltDownload("https://www.instagram.com/reel/xxx");
```

أو عبر `api.djamel` مباشرة في الأوامر:

```js
// متوفر تلقائياً بعد تسجيل الدخول عبر Djamel-fca
await api.djamel.sendPhoto(url, caption, event.threadID);
await api.djamel.sendVideo(url, caption, event.threadID);
await api.djamel.sendAudio(url, caption, event.threadID);
await api.djamel.sendFromSocial(url, caption, event.threadID);
await api.djamel.sendMultiPhoto([url1, url2], caption, event.threadID);
await api.djamel.cobaltDownload(url); // يرجع رابط مباشر
```

---

## باقي الـ API (login, cookies, session)

```js
const djamelFca = require("./Djamel-fca");

djamelFca(appState, opts, (err, api, info) => {
  if (err) throw err;
  // api جاهز للاستخدام مع كل ميزات @dongdev/fca-unofficial
  // + api.djamel للميزات المضافة
});
```

---

## الإصدارات

| الإصدار | الجديد |
|---------|--------|
| v4.0 | إضافة Media Helpers: sendPhoto, sendVideo, sendAudio, sendMultiPhoto, cobaltDownload, sendFromSocial |
| v3.0 | النسخة الأصلية: login, cookies, session, typing |
