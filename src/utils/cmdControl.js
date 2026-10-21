/**
 * Djamel-Fca Architecte Core — Command Control (per-thread enable/disable)
 * Copyright © 2025 DJAMEL
 */
"use strict";

const fs   = require("fs-extra");
const path = require("path");

const CTRL_PATH = path.join(process.cwd(), "data", "cmdControl.json");

function loadCtrl() {
  try {
    if (!fs.existsSync(CTRL_PATH)) return {};
    return JSON.parse(fs.readFileSync(CTRL_PATH, "utf8")) || {};
  } catch (_) { return {}; }
}

function saveCtrl(data) {
  try {
    fs.ensureDirSync(path.dirname(CTRL_PATH));
    fs.writeFileSync(CTRL_PATH, JSON.stringify(data, null, 2));
  } catch (_) {}
}

let _ctrl = loadCtrl();

function reload() { _ctrl = loadCtrl(); }

/**
 * mode: "blacklist" (default) — all enabled except listed
 *        "whitelist"           — only listed are enabled
 * commands: array of command names
 */
function getThreadConfig(tid) {
  return _ctrl[String(tid)] || { mode: "blacklist", commands: [] };
}

function setThreadConfig(tid, config) {
  _ctrl[String(tid)] = config;
  saveCtrl(_ctrl);
}

function resetThread(tid) {
  delete _ctrl[String(tid)];
  saveCtrl(_ctrl);
}

function isEnabled(tid, cmdName) {
  // Keep the control command available so an admin can always recover
  // a thread's command configuration from another conversation.
  if (String(cmdName).toLowerCase() === "chats") return true;
  const cfg = getThreadConfig(tid);
  const inList = (cfg.commands || []).map(String).includes(String(cmdName).toLowerCase());
  if (cfg.mode === "whitelist") return inList;
  return !inList; // blacklist default
}

function setCommandEnabled(tid, cmdName, enabled) {
  const name = String(cmdName || "").trim().toLowerCase();
  if (!name || name === "chats") return getThreadConfig(tid);

  const current = getThreadConfig(tid);
  const commands = new Set((current.commands || []).map(value => String(value).toLowerCase()));

  if (current.mode === "whitelist") {
    if (enabled) commands.add(name);
    else commands.delete(name);
  } else {
    // Blacklist is the default: enabled means absent from the blocked list.
    if (enabled) commands.delete(name);
    else commands.add(name);
  }

  const next = { mode: current.mode === "whitelist" ? "whitelist" : "blacklist", commands: [...commands] };
  setThreadConfig(tid, next);
  return next;
}

function toggleCommand(tid, cmdName) {
  return setCommandEnabled(tid, cmdName, !isEnabled(tid, cmdName));
}

function getAllThreads() {
  return Object.keys(_ctrl);
}

function getAll() {
  return { ..._ctrl };
}

module.exports = {
  isEnabled,
  setCommandEnabled,
  toggleCommand,
  getThreadConfig,
  setThreadConfig,
  resetThread,
  getAllThreads,
  getAll,
  reload,
};
