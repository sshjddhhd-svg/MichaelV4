/**
 * Djamel-Fca Architecte Core — Persistent Group Chat Memory
 * Copyright © 2025 DJAMEL
 *
 * Lightweight JSON memory designed for Railway/Node 20.
 * Stores recent group messages, member names and small user facts.
 */
"use strict";

const fs = require("fs-extra");
const path = require("path");

const DATA_DIR = path.join(process.cwd(), "database", "data");
const FILE = path.join(DATA_DIR, "chatMemory.json");
const MAX_MESSAGES = 80;
const MAX_USERS = 150;
const MAX_MESSAGE_LENGTH = 700;
const THREAD_TTL = 45 * 24 * 60 * 60 * 1000;

let db = null;
let saveTimer = null;
let dirty = false;

function emptyDB() {
  return { version: 2, updatedAt: Date.now(), threads: {} };
}

function load() {
  if (db) return db;
  try {
    db = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : emptyDB();
    if (!db || typeof db !== "object") db = emptyDB();
    if (!db.threads || typeof db.threads !== "object") db.threads = {};
  } catch (_) {
    db = emptyDB();
  }
  return db;
}

function ensureThread(threadID) {
  const store = load();
  const tid = String(threadID);
  if (!store.threads[tid] || typeof store.threads[tid] !== "object") {
    store.threads[tid] = { mode: "smart", users: {}, messages: [], updatedAt: Date.now() };
  }
  const thread = store.threads[tid];
  if (!thread.users || typeof thread.users !== "object") thread.users = {};
  if (!Array.isArray(thread.messages)) thread.messages = [];
  if (!thread.mode) thread.mode = "smart";
  return thread;
}

function markDirty() {
  dirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    save();
  }, 900);
  if (saveTimer.unref) saveTimer.unref();
}

function save() {
  if (!db || !dirty) return;
  dirty = false;
  try {
    fs.ensureDirSync(DATA_DIR);
    db.updatedAt = Date.now();
    const tmp = `${FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, FILE);
  } catch (_) {
    dirty = true;
  }
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, MAX_MESSAGE_LENGTH);
}

function extractFacts(text) {
  const body = normalizeText(text);
  const facts = [];
  const patterns = [
    /(?:اسمي|إسمي|my name is)\s+([^،,.;!?\n]{2,60})/i,
    /(?:ينادوني|نادوني|call me)\s+([^،,.;!?\n]{2,60})/i
  ];
  for (const re of patterns) {
    const m = body.match(re);
    if (m?.[1]) facts.push(`الاسم: ${m[1].trim()}`);
  }
  return [...new Set(facts)].slice(0, 8);
}

function rememberUser(threadID, userID, name) {
  if (!threadID || !userID) return;
  const thread = ensureThread(threadID);
  const id = String(userID);
  const cleanName = normalizeText(name).slice(0, 80);
  const current = thread.users[id] || { id, name: "", facts: [], firstSeen: Date.now(), lastSeen: Date.now() };
  if (!Array.isArray(current.facts)) current.facts = [];
  if (cleanName) current.name = cleanName;
  current.lastSeen = Date.now();
  thread.users[id] = current;

  const ids = Object.keys(thread.users);
  if (ids.length > MAX_USERS) {
    ids.sort((a, b) => (thread.users[a].lastSeen || 0) - (thread.users[b].lastSeen || 0));
    for (const oldID of ids.slice(0, ids.length - MAX_USERS)) delete thread.users[oldID];
  }
  thread.updatedAt = Date.now();
  markDirty();
}

function addMessage({ threadID, userID, name, text, timestamp, isBot = false }) {
  if (!threadID || !userID) return;
  const body = normalizeText(text);
  if (!body) return;
  const thread = ensureThread(threadID);
  rememberUser(threadID, userID, name);
  const facts = extractFacts(body);
  const profile = thread.users[String(userID)];
  if (profile && facts.length) {
    profile.facts = [...new Set([...(profile.facts || []), ...facts])].slice(-8);
    profile.lastSeen = Date.now();
  }
  thread.messages.push({
    userID: String(userID),
    name: normalizeText(name).slice(0, 80),
    text: body,
    ts: Number(timestamp) || Date.now(),
    bot: !!isBot
  });
  if (thread.messages.length > MAX_MESSAGES) thread.messages.splice(0, thread.messages.length - MAX_MESSAGES);
  thread.updatedAt = Date.now();
  markDirty();
}

function setMode(threadID, mode) {
  const thread = ensureThread(threadID);
  thread.mode = ["off", "smart", "always"].includes(mode) ? mode : "smart";
  thread.updatedAt = Date.now();
  markDirty();
  return thread.mode;
}

function getMode(threadID) {
  return ensureThread(threadID).mode || "smart";
}

function getMessages(threadID, limit = 24) {
  const thread = ensureThread(threadID);
  return thread.messages.slice(-Math.max(1, Math.min(60, Number(limit) || 24)));
}

function getUsers(threadID) {
  const thread = ensureThread(threadID);
  return Object.values(thread.users || {}).sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
}

function findUsers(threadID, query) {
  const q = normalizeText(query).toLowerCase();
  if (!q) return [];
  return getUsers(threadID).filter(u =>
    String(u.id).includes(q) || String(u.name || "").toLowerCase().includes(q)
  ).slice(0, 10);
}

function getStats(threadID) {
  const thread = ensureThread(threadID);
  return {
    mode: thread.mode || "smart",
    messages: thread.messages.length,
    users: Object.keys(thread.users || {}).length,
    updatedAt: thread.updatedAt || 0
  };
}

function clearThread(threadID) {
  const tid = String(threadID);
  load();
  delete db.threads[tid];
  markDirty();
  save();
}

function prune() {
  load();
  const cutoff = Date.now() - THREAD_TTL;
  for (const [tid, thread] of Object.entries(db.threads)) {
    if ((thread.updatedAt || 0) < cutoff) delete db.threads[tid];
    else if (Array.isArray(thread.messages) && thread.messages.length > MAX_MESSAGES) {
      thread.messages = thread.messages.slice(-MAX_MESSAGES);
    }
  }
  markDirty();
}

const cleanupTimer = setInterval(prune, 6 * 60 * 60 * 1000);
if (cleanupTimer.unref) cleanupTimer.unref();
process.once("beforeExit", save);
process.once("SIGTERM", save);
process.once("SIGINT", save);

module.exports = {
  addMessage,
  rememberUser,
  getMessages,
  getUsers,
  findUsers,
  extractFacts,
  getStats,
  setMode,
  getMode,
  clearThread,
  save
};
