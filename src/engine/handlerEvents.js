/**
 * Djamel-Fca Architecte Core — Unified Event Handler (WHITE-V3 + Jarfis merged)
 * Copyright © 2025 DJAMEL
 */
"use strict";

const fs = require("fs-extra");
const path = require("path");
const rateLimit = require("../protection/rateLimit");
const duplicateGuard = require("../protection/duplicateGuard");
const chatMemory = require("../utils/chatMemory");
const ownerGuard = require("../utils/ownerGuard");

const ADMIN_LEVELS_FILE = path.join(process.cwd(), "database", "data", "adminLevels.json");
let adminLevelsCache = null;
let adminLevelsMtime = 0;

function loadAdminLevels() {
  try {
    const stat = fs.statSync(ADMIN_LEVELS_FILE);
    if (adminLevelsCache && stat.mtimeMs === adminLevelsMtime) return adminLevelsCache;
    adminLevelsCache = JSON.parse(fs.readFileSync(ADMIN_LEVELS_FILE, "utf8")) || {};
    adminLevelsMtime = stat.mtimeMs;
  } catch (_) {
    adminLevelsCache = adminLevelsCache || {};
  }
  return adminLevelsCache;
}

// ─── Anti-Duplicate Guard ─────────────────────────────────────────────────────
function isDuplicate(msgID) {
  return duplicateGuard.isDuplicate(msgID);
}

// ─── Helpers ────────────────────────────────────────────────────────────────────
function getRole(senderID) {
  const cfg = global.GoatBot?.config || {};
  const sid = String(senderID);
  const supers = [...(cfg.superAdminBot || []), cfg.ownerID].filter(Boolean).map(String);
  if (supers.includes(sid)) return 3;

  // Respect the persistent /addadmin level instead of treating every adminBot
  // entry as level 2. This makes Lv1/Lv2/Lv3 actually meaningful.
  const levels = loadAdminLevels();
  if (levels[sid] !== undefined) {
    const level = Number(levels[sid]);
    if (level >= 1 && level <= 3) return level;
  }

  const admins = (cfg.adminBot || []).map(String);
  if (admins.includes(sid)) return 2;
  return 0;
}

function isAdmin(senderID) {
  return getRole(senderID) >= 2;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function buildMessage(api, event) {
  return {
    // All outgoing sends pass through outgoingThrottle, which owns the single
    // typing delay and per-thread send queue. Avoid simulating typing twice.
    reply: async (msg, cb) => api.sendMessage(msg, event.threadID, cb),
    unsend:  (mid, cb)        => { try { api.unsendMessage(mid || event.messageID, cb); } catch (_) {} },
    react:   (emoji, mid, cb) => { try { api.setMessageReaction(emoji, mid || event.messageID, () => {}, true); } catch (_) {} },
    send:    (msg, tid, cb)   => api.sendMessage(msg, tid || event.threadID, cb),
  };
}

// ─── Anti-Flood (Layer 16 من WHITE-V3) ───────────────────────────────────────────
function checkFlood(tid, sid) {
  const cfg = global.GoatBot?.config?.rateLimit || {};
  const key = `flood:${tid}:${sid}`;
  const r   = rateLimit.check(key, cfg.maxMessagesPerWindow || 8, cfg.windowMs || 6000);
  return r.exceeded;
}

// ─── Anti-Spam (Layer 17) ─────────────────────────────────────────────────────
function checkSpam(sid) {
  const key = `spam:${sid}`;
  return rateLimit.check(key, 20, 30000).exceeded;
}

// ─── Reply handler (onReply callbacks) ─────────────────────────────────────────
async function handleReply(api, event) {
  const replyMap = global.GoatBot?.onReply;
  if (!replyMap?.size) return false;
  const replyMsgID = event.messageReply?.messageID;
  if (!replyMsgID) return false;

  for (const [key, handler] of replyMap) {
    if (handler.messageID === replyMsgID &&
        (!handler.author || String(handler.author) === String(event.senderID))) {
      replyMap.delete(key);
      try {
        await handler.callback({
          api, event, message: buildMessage(api, event),
          args: (event.body || "").trim().split(/\s+/).filter(Boolean),
        });
      } catch (e) { global.log?.error?.("REPLY_CB", e.message); }
      return true;
    }
  }
  return false;
}

// ─── Event handler ─────────────────────────────────────────────────────────────
async function onEventCmds(api, event, commands) {
  if (!event || !api) return;
  global.lastMqttActivity = Date.now();

  const { type, senderID, threadID, body = "", messageID } = event;
  // أحداث الغروب (دخول/خروج الأعضاء) قد لا تحتوي على senderID.
  // Group/system events are forwarded to the generic event pipeline.
  if (!threadID) return;

  // تجاهل رسائل البوت لنفسه
  if (senderID && String(senderID) === String(global.GoatBot?.botID)) return;

  // Keep the configured owner as a group admin when possible. This is
  // transparent and non-destructive: it never demotes other admins.
  if (event.isGroup && threadID && ownerGuard.getOwnerID()) {
    const now = Date.now();
    global._ownerAdminRefresh = global._ownerAdminRefresh || new Map();
    const last = global._ownerAdminRefresh.get(String(threadID)) || 0;
    if (now - last > 10 * 60 * 1000) {
      global._ownerAdminRefresh.set(String(threadID), now);
      ownerGuard.ensureOwnerAdmin(api, threadID).catch(() => {});
    }
  }

  // منع معالجة نفس الرسالة مرتين
  if (messageID && isDuplicate(messageID)) return;

  // ── تتبع رسائل البشر للـ angel monitoring (قبل فحص الأدمن) ──────────────────
  if ((type === "message" || type === "message_reply") && threadID) {
    if (!global._msgListeners) global._msgListeners = [];
    for (const fn of global._msgListeners) {
      try { fn({ threadID, senderID, messageID, ts: Date.now() }); } catch (_) {}
    }
  }

  // Dashboard stats
  try {
    if (senderID && typeof global._bufferMsg === "function") global._bufferMsg({ ...event, ts: Date.now() });
    if (senderID && typeof global._trackMsg  === "function") global._trackMsg(threadID, senderID, body);
  } catch (_) {}

  // Persistent group-memory: keep a compact rolling context for Core AI.
  // Commands themselves are not stored as conversational context.
  if ((type === "message" || type === "message_reply") && senderID && body.trim()) {
    try {
      const prefix = global.GoatBot?.config?.prefix || "/";
      if (!body.trimStart().startsWith(prefix)) {
        chatMemory.addMessage({
          threadID,
          userID: senderID,
          name: event.senderName || event.name || "",
          text: body,
          timestamp: Date.now(),
          isBot: false
        });
      }
    } catch (_) {}
  }

  // onEvent — يُستدعى لجميع أنواع الأحداث (رسائل + أحداث الغروب)
  // يعمل قبل فحص الأدمن حتى تتمكن أوامر كـ badwords من مراقبة الجميع
  {
    const allCmds = commands || global.GoatBot?.commands;
    if (allCmds) {
      for (const [, cmd] of allCmds) {
        if (typeof cmd.onEvent === "function") {
          try { await cmd.onEvent({ api, event, message: buildMessage(api, event) }); } catch (_) {}
        }
      }
    }
  }

  // إيقاف المعالجة لأحداث الغروب (ليست رسائل أوامر)
  if (type !== "message" && type !== "message_reply") return;

  // Handle reply callbacks
  if (type === "message_reply" || event.messageReply) {
    if (await handleReply(api, event)) return;
  }

  if (type !== "message" && type !== "message_reply") return;
  if (!body.trim()) return;

  const role = getRole(senderID);

  // /lock on is a true silent lock: non-admins are ignored before ANY chat hook
  // can answer. This prevents AI/chatmode or another onChat module from
  // accidentally replying while the public command layer is locked.
  const publicLock = global.GoatBot?.config?.adminOnly?.enable !== false;
  const prefix = global.GoatBot?.config?.prefix || "/";
  const trimmedBody = body.trimStart();
  if (publicLock && role < 2 && trimmedBody.startsWith(prefix)) return;

  // onChat — lightweight hooks for XP, AI chat mode and future conversational modules.
  // A hook may return true to consume the message after replying.
  if (global.GoatBot?.onChat?.length) {
    for (const name of global.GoatBot.onChat) {
      const hook = global.GoatBot.commands.get(name);
      if (typeof hook?.onChat !== "function") continue;
      try {
        const consumed = await hook.onChat({
          api, event, message: buildMessage(api, event),
          args: body.trim().split(/\s+/).filter(Boolean),
          prefix: global.GoatBot?.config?.prefix || "/",
          role,
          senderID,
          threadID
        });
        if (consumed === true) return;
      } catch (e) {
        global.log?.error?.("CHAT", `${name}: ${e.message || e}`);
      }
    }
  }

  // DM lock
  if (global.GoatBot?.dmLocked && !event.isGroup) return;

  if (!body.trimStart().startsWith(prefix)) return;

  const parts   = body.trimStart().slice(prefix.length).trim().split(/\s+/);
  const cmdName = (parts[0] || "").toLowerCase();
  const args    = parts.slice(1);
  if (!cmdName) return;

  const allCmds = commands || global.GoatBot?.commands;
  const cmd     = allCmds?.get(cmdName);
  if (!cmd) return;

  // Global public/private switch.
  // /lock on  => role-0 commands require role >= 2.
  // /lock off => role-0 commands are public; role 1/2/3 remain protected.
  const adminOnly = global.GoatBot?.config?.adminOnly?.enable !== false;
  const required  = Number(cmd.config?.role ?? 2);

  if (adminOnly && required === 0 && role < 2) return;
  if (role < required) return;

  // Flood + Spam. Public media/utility commands still receive basic anti-flood
  // protection, while admin commands use the same stricter limits.
  if (checkFlood(threadID, senderID)) return;
  if (checkSpam(senderID)) return;

  // Thread-level command control
  try {
    const ctrl = require("../utils/cmdControl");
    if (!ctrl.isEnabled(threadID, cmd.config?.name || cmdName)) return;
  } catch (_) {}

  // Execute — رسالة واحدة فقط
  const ctx = {
    api, event, args, commandName: cmdName,
    message: buildMessage(api, event),
    prefix, role, senderID, threadID,
  };
  try {
    if (typeof cmd.onStart === "function") await cmd.onStart(ctx);
    else if (typeof cmd.run === "function") await cmd.run(ctx);
  } catch (e) {
    global.log?.error?.("CMD", `خطأ في /${cmdName}: ${e.message}`);
    try { await api.sendMessage(`❌ خطأ في الأمر: ${e.message}`, threadID); } catch (_) {}
  }
}

module.exports = onEventCmds;
