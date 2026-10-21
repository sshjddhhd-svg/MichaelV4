/**
 * Djamel-Fca Architecte Core — Protected Bot Owner Guard
 * Copyright © 2025 DJAMEL
 *
 * Transparent owner protection. The owner ID is read from OWNER_ID first,
 * then config.ownerID. The ID is never printed by this module.
 */
"use strict";

function getOwnerID() {
  return String(process.env.OWNER_ID || global.GoatBot?.config?.ownerID || "").trim();
}

function isOwner(id) {
  const owner = getOwnerID();
  return !!owner && String(id || "") === owner;
}

function protectedIDs() {
  const cfg = global.GoatBot?.config || {};
  return new Set([
    getOwnerID(),
    ...(cfg.superAdminBot || []).map(String),
    ...(cfg.adminBot || []).map(String)
  ].filter(Boolean));
}

function callApi(api, method, ...args) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (err, data) => {
      if (settled) return;
      settled = true;
      err ? reject(err) : resolve(data);
    };
    try {
      const result = api?.[method]?.(...args, done);
      if (result && typeof result.then === "function") result.then(v => done(null, v)).catch(done);
    } catch (e) { done(e); }
  });
}

/**
 * If the owner is already in the group and the bot is an admin, keep the
 * owner as a group admin. This is intentionally non-destructive: it never
 * removes or demotes other group admins.
 */
async function ensureOwnerAdmin(api, threadID) {
  const owner = getOwnerID();
  if (!owner || !threadID || !api) return { ok: false, reason: "owner-not-configured" };

  try {
    const info = await callApi(api, "getThreadInfo", String(threadID));
    const admins = new Set((info?.adminIDs || []).map(String));
    const members = new Set((info?.participantIDs || info?.participantIds || []).map(String));

    if (admins.has(owner)) return { ok: true, already: true };
    if (members.size && !members.has(owner)) return { ok: false, reason: "owner-not-member" };

    const botID = String(api.getCurrentUserID?.() || global.GoatBot?.botID || "");
    if (botID && !admins.has(botID)) return { ok: false, reason: "bot-not-admin" };

    await callApi(api, "changeAdminStatus", owner, String(threadID), true);
    return { ok: true, changed: true };
  } catch (error) {
    return { ok: false, reason: error?.message || "admin-change-failed" };
  }
}

module.exports = { getOwnerID, isOwner, protectedIDs, ensureOwnerAdmin, callApi };
