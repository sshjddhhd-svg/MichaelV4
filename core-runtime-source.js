/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║           Djamel-Fca Architecte — DjamelBot Engine (المحرك الرئيسي)         ║
 * ║           Copyright © 2025 DJAMEL — All rights reserved        ║
 * ║           Version 2.0 | Engine: Djamel-Fca Architecte                          ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */
"use strict";

// ─── Global Polyfills ──────────────────────────────────────────────────────────
(function polyfill() {
  try { if (!global.ReadableStream) { const s = require("stream/web"); Object.assign(global, { ReadableStream: s.ReadableStream, WritableStream: s.WritableStream, TransformStream: s.TransformStream }); } } catch (_) {}
  try { if (!global.Blob)         global.Blob        = require("buffer").Blob; }   catch (_) {}
  try { if (!global.TextEncoder)  { const { TextEncoder, TextDecoder } = require("util"); Object.assign(global, { TextEncoder, TextDecoder }); } } catch (_) {}
  if (!global.File) {
    global.File = class File extends (global.Blob || Object) {
      constructor(c, n, o = {}) { try { super(c, o); } catch (_) {} this._name = n; this._lm = o.lastModified ?? Date.now(); }
      get name() { return this._name; }
      get lastModified() { return this._lm; }
    };
  }
})();

process.on("unhandledRejection", e => { try { (global.log?.error || console.error)("Djamel-Fca Architecte", e?.message || String(e)); } catch (_) {} });
process.on("uncaughtException",  e => { try { (global.log?.error || console.error)("Djamel-Fca Architecte", e?.message || String(e)); } catch (_) {} });

const fs       = require("fs-extra");
const path     = require("path");
const chalk    = require("chalk");
const gradient = require("gradient-string");
const moment   = require("moment-timezone");

const DjamelFCA                   = require("./Djamel-fca");
const { initGlobals }             = require("./src/engine/core");
const { loadCommands }            = require("./src/engine/loader");
const handlerEvents               = require("./src/engine/handlerEvents");
const { startDashboard, getIO, interceptLogs } = require("./src/dashboard/server");
const { initDB }                  = require("./src/utils/database");
const { startPoller, stopPoller } = require("./src/utils/customPoller");

const ROOT         = __dirname;
const CONFIG_PATH  = path.join(ROOT, "config.json");
const ACCOUNT_PATH = path.join(ROOT, "account.txt");
const CMDS_DIR     = path.join(ROOT, "src/commands");
const PORT           = parseInt(process.env.PORT || "8080", 10);
// Compatibility contract: bot/health port 5000, dashboard port 8080.
// Railway can route a generated domain to 8080 using its Target Port setting.
// Railway routes its public domain to PORT, so the dashboard listens there by default.
const DASHBOARD_PORT = parseInt(process.env.DASHBOARD_PORT || process.env.PORT || "8080", 10);
const HEALTH_PORT    = PORT !== DASHBOARD_PORT ? PORT : null;

// ─── Load Config ───────────────────────────────────────────────────────────────
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    }
    const rawConfig = process.env.DJAMEL_FCA_CONFIG_JSON;
    if (!rawConfig) {
      throw new Error("config.json غير موجود؛ عيّن DJAMEL_FCA_CONFIG_JSON كسِرّ في Railway.");
    }
    const parsed = JSON.parse(rawConfig);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("DJAMEL_FCA_CONFIG_JSON يجب أن يحتوي كائن إعدادات JSON.");
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(parsed, null, 2), {
      encoding: "utf8",
      mode: 0o600
    });
    return parsed;
  } catch (e) {
    console.error("❌ تعذر تحميل الإعدادات:", e.message);
    process.exit(1);
  }
}

let config = loadConfig();
initGlobals(config);
const log = global.log;

// ─── Live log interceptor (for dashboard logs page) ───────────────────────────
interceptLogs();

// ─── Hot-reload config (تحديث الإعدادات بدون إعادة تشغيل) ──────────────────
let _cfgDebounce = null;
fs.watch(CONFIG_PATH, () => {
  if (global._selfWriteConfig) return;
  clearTimeout(_cfgDebounce);
  _cfgDebounce = setTimeout(() => {
    try {
      const newCfg = loadConfig();
      config = newCfg;
      global.GoatBot.config = newCfg;
      global.config = newCfg;
      global.commandPrefix = newCfg.prefix || "/";
      log.ok("HOT", "config.json تم تحديثه تلقائياً بدون إعادة تشغيل ✔");
      const io = getIO();
      if (io) io.emit("config-reloaded", { ts: Date.now() });
    } catch (e) { log.error("HOT", "فشل تحديث config: " + e.message); }
  }, 800);
});

// ─── Banner ────────────────────────────────────────────────────────────────────
function printBanner() {
  console.clear();
  const art = `
██████╗  █████╗ ██╗   ██╗██╗██████╗     ██╗   ██╗ ██╗
██╔══██╗██╔══██╗██║   ██║██║██╔══██╗    ██║   ██║███║
██║  ██║███████║██║   ██║██║██║  ██║    ██║   ██║╚██║
██║  ██║██╔══██║╚██╗ ██╔╝██║██║  ██║    ╚██╗ ██╔╝ ██║
██████╔╝██║  ██║ ╚████╔╝ ██║██████╔╝     ╚████╔╝  ██║
╚═════╝ ╚═╝  ╚═╝  ╚═══╝  ╚═╝╚═════╝       ╚═══╝   ╚═╝`;
  console.log(gradient.pastel(art));
  console.log(chalk.hex("#00b4d8")("  ═".repeat(30)));
  console.log(chalk.hex("#ffd166")(`  Developer  : DJAMEL`));
  console.log(chalk.hex("#06d6a0")(`  Engine     : Djamel-Fca Architecte v2.0`));
  console.log(chalk.hex("#90e0ef")(`  Library    : Djamel-fca v3.0`));
  console.log(chalk.hex("#ff6b6b")(`  Framework  : WHITE V3 + Jarfis Merged`));
  console.log(chalk.hex("#00b4d8")(`  Bot/Health : ${PORT}`));
  console.log(chalk.hex("#00b4d8")(`  Dashboard  : ${DASHBOARD_PORT}`));
  console.log(chalk.hex("#00b4d8")("  ═".repeat(30)));
  console.log();
}

// ─── Stop listeners ────────────────────────────────────────────────────────────
function stopListening() {
  stopPoller();
  try { if (global._currentListener) { global._currentListener(); global._currentListener = null; } } catch (_) {}
  try { if (global._listenTimer) { clearTimeout(global._listenTimer); global._listenTimer = null; } } catch (_) {}
  try { if (global.GoatBot?.fcaApi?.ctx?.mqttClient) global.GoatBot.fcaApi.ctx.mqttClient.end(true); } catch (_) {}
}

// ─── Message handler wrapper ────────────────────────────────────────────────────
function onEvent(api, event) {
  if (!event) return;
  global.lastMqttActivity = Date.now();
  handlerEvents(api, event, global.GoatBot.commands).catch(e => {
    log.error("EVENT", e?.message || String(e));
  });
}

// ─── HTTP Long-Poll fallback ────────────────────────────────────────────────────
function startPolling(api, attempt = 1, generation = global._connectionGeneration) {
  const MAX = 3;
  log.warn("POLL", `بدء HTTP Long-Poll (محاولة ${attempt}/${MAX})…`);
  let started = false;

  const stop = api.listen((err, event) => {
    if (err) {
      const msg = String(err.error || err.message || err);
      log.error("POLL", msg);
      if (attempt < MAX) setTimeout(() => generation === global._connectionGeneration && startPolling(api, attempt + 1, generation), attempt * 8000);
      else if (generation === global._connectionGeneration) { log.warn("POLL", "→ Custom Poller"); startPoller(api, handlerEvents, config.pollIntervalMs || 6000); }
      return;
    }
    if (!started) {
      started = true;
      log.ok("POLL", `نشط ✔ — UID: ${chalk.bold.green(api.getCurrentUserID())}`);
      const io = getIO();
      if (io) io.emit("bot-status", { status: "online", uid: api.getCurrentUserID() });
    }
    onEvent(api, event);
  });
  global._currentListener = stop;
}

// ─── MQTT Connection ───────────────────────────────────────────────────────────
function startMqtt(api, attempt = 1, generation = global._connectionGeneration) {
  const MAX = 4;
  log.info("MQTT", `اتصال (محاولة ${attempt}/${MAX})…`);
  let mqttOk = false;

  const timer = setTimeout(() => {
    if (generation !== global._connectionGeneration) return;
    if (!mqttOk) { log.warn("MQTT", "timeout → Long-Poll"); stopListening(); startPolling(api, 1, generation); }
  }, 22000);
  global._listenTimer = timer;

  const listenFn = api.listenMqtt || api.listen;
  const stop = listenFn?.call(api, (err, event) => {
    if (generation !== global._connectionGeneration) return;
    if (err) {
      clearTimeout(timer);
      const msg = String(err.error || err.message || err.type || err);
      log.warn("MQTT", `${msg} (${attempt}/${MAX})`);
      if (attempt < MAX) setTimeout(() => generation === global._connectionGeneration && startMqtt(api, attempt + 1, generation), Math.min(attempt * 8000, 40000));
      else startPolling(api, 1, generation);
      return;
    }
    if (!mqttOk) {
      mqttOk = true;
      clearTimeout(timer);
      global._listenTimer = null;
      log.ok("MQTT", `متصل ✔ — UID: ${chalk.bold.green(api.getCurrentUserID())}`);
      const io = getIO();
      if (io) io.emit("bot-status", { status: "online", uid: api.getCurrentUserID() });
    }
    onEvent(api, event);
  });
  if (stop) global._currentListener = stop;
  else { clearTimeout(timer); startPolling(api, 1, generation); }
}

// ─── Protection Engine ───────────────────────────────────────────────────────
function startProtection(api) {
  const layers = [
    ["outgoingThrottle", "start"],
    ["humanTyping", "start"],
    ["keepAlive", "start"],
    ["mqttHealthCheck", "startHealthCheck"],
    ["sessionRefresher", "start"],
  ];
  let active = 0;
  for (const [name, fn] of layers) {
    try {
      const mod = require(`./src/protection/${name}`);
      if (typeof mod[fn] === "function") { mod[fn](api); active++; }
    } catch (e) {
      log.warn("PROTECTION", `${name}: ${e.message || e}`);
    }
  }
  // outgoingThrottle is the single send queue; humanTyping is consumed there
  // to avoid double-wrapping api.sendMessage and stacking multiple delays.
  global.GoatBot.protection = {
    active,
    duplicateGuard: true,
    inboundRateLimit: true,
    outboundThrottle: require("./src/protection/outgoingThrottle").isActive(),
    humanTyping: require("./src/protection/humanTyping").isActive(),
    connectionHealth: true,
    sessionMonitor: true,
  };
  log.ok("PROTECTION", `🛡️ ${active} طبقات حماية مفعّلة + مانع التكرار وتحديد المعدل ✔`);
}
function stopProtection() {
  const names = ["outgoingThrottle", "humanTyping", "keepAlive", "mqttHealthCheck", "sessionRefresher"];
  for (const name of names) {
    try {
      const m = require(`./src/protection/${name}`);
      if (typeof m.stop === "function") m.stop();
      if (typeof m.stopHealthCheck === "function") m.stopHealthCheck();
    } catch (_) {}
  }
}

// ─── Login lock ──────────────────────────────────────────────────────────────────
let _loginLock = false;

// ─── تسجيل الدخول الرئيسي ──────────────────────────────────────────────────────
async function startBot() {
  if (_loginLock) { log.warn("LOGIN", "تسجيل دخول جارٍ — تجاهل"); return; }
  _loginLock = true;
  global._connectionGeneration = (global._connectionGeneration || 0) + 1;
  const generation = global._connectionGeneration;
  const io = getIO();
  stopListening();
  stopProtection();

  global.GoatBot.fcaApi = null;
  global.GoatBot.botID  = null;
  global.api            = null;

  if (io) io.emit("bot-status", { status: "connecting", uid: null });

  // قراءة الكوكيز
  if (!fs.existsSync(ACCOUNT_PATH)) { fs.writeFileSync(ACCOUNT_PATH, "", { encoding: "utf8", mode: 0o600 }); try { fs.chmodSync(ACCOUNT_PATH, 0o600); } catch (_) {} }
  const rawCookie = fs.readFileSync(ACCOUNT_PATH, "utf8").trim();

  if (!rawCookie) {
    log.error("LOGIN", "لا توجد كوكيز — ارفعها من لوحة التحكم");
    if (io) io.emit("bot-status", { status: "offline", message: "لا توجد كوكيز" });
    _loginLock = false; return;
  }

  const { parseCookieInput, hasMandatory, checkLiveCookie, cookiesToString, getUA } = DjamelFCA;
  const parsed = parseCookieInput(rawCookie);
  const cookies = parsed.cookies;

  if (!cookies.length || !hasMandatory(cookies)) {
    log.error("LOGIN", "الكوكيز غير صالحة (c_user أو xs مفقود)");
    if (io) io.emit("bot-status", { status: "offline", message: "كوكيز غير صالحة" });
    _loginLock = false; return;
  }

  const UA = config.facebookAccount?.userAgent || getUA();
  log.info("LOGIN", "التحقق من صلاحية الكوكيز…");
  const valid = await checkLiveCookie(cookiesToString(cookies), UA);
  if (valid) log.ok("LOGIN", "الكوكيز صالحة ✔");
  else log.warn("LOGIN", "تحذير: التحقق من mbasic فشل — سنحاول رغم ذلك");

  let attempt = 0;
  const MAX_ATTEMPTS = 3;

  function tryLogin() {
    attempt++;
    log.info("LOGIN", `محاولة ${attempt}/${MAX_ATTEMPTS}…`);
    DjamelFCA(cookies, { userAgent: UA }, async (err, api, extras) => {
      if (err) {
        const msg = err.message || String(err);
        log.error("LOGIN", `فشل (${attempt}/${MAX_ATTEMPTS}): ${msg}`);
        if (io) io.emit("bot-status", { status: "error", message: `فشل: ${msg}` });
        if (attempt < MAX_ATTEMPTS) { setTimeout(tryLogin, attempt * 5000); return; }
        log.error("LOGIN", "وصل لأقصى محاولات");
        if (io) io.emit("bot-status", { status: "offline", message: "فشل تسجيل الدخول" });
        _loginLock = false; return;
      }

      // حفظ AppState
      try {
        if (extras?.appState?.length) {
          global._selfWrite = true;
          fs.writeFileSync(ACCOUNT_PATH, JSON.stringify(extras.appState, null, 2), { mode: 0o600 });
          try { fs.chmodSync(ACCOUNT_PATH, 0o600); } catch (_) {}
          setTimeout(() => { global._selfWrite = false; }, 6000);
        }
      } catch (_) {}

      global._writeAppState = (state) => {
        try {
          if (!Array.isArray(state) || !state.length) return;
          global._selfWrite = true;
          fs.writeFileSync(ACCOUNT_PATH, JSON.stringify(state, null, 2), { mode: 0o600 });
          try { fs.chmodSync(ACCOUNT_PATH, 0o600); } catch (_) {}
          setTimeout(() => { global._selfWrite = false; }, 1500);
        } catch (e) { log.warn("SESSION", e.message || String(e)); }
      };

      const uid = api.getCurrentUserID();
      global.GoatBot.fcaApi = api;
      global.GoatBot.botID  = uid;
      global.api            = api;

      // اسم البوت
      let botName = config.botName || "Djamel-Fca Architecte";
      try {
        const info = await new Promise((res, rej) =>
          api.getUserInfo(uid, (e, d) => e ? rej(e) : res(d)));
        botName = info?.[uid]?.name || botName;
      } catch (_) {}

      log.ok("LOGIN", `✔ مرحباً ${chalk.bold.cyan(botName)} — UID: ${chalk.bold.green(uid)}`);

      // طباعة بطاقة المعلومات
      console.log();
      console.log(chalk.hex("#00b4d8")("  ┌──────────────────────────────────────────┐"));
      console.log(`  │  ${chalk.yellow("Bot:")}      ${chalk.white(botName.padEnd(35))}│`);
      console.log(`  │  ${chalk.yellow("UID:")}      ${chalk.white(uid.padEnd(35))}│`);
      console.log(`  │  ${chalk.yellow("Prefix:")}   ${chalk.white((config.prefix||"/").padEnd(35))}│`);
      console.log(`  │  ${chalk.yellow("Commands:")} ${chalk.white(String(global.GoatBot.commands.size).padEnd(35))}│`);
      console.log(`  │  ${chalk.yellow("Engine:")}   ${chalk.white("Djamel-Fca Architecte — Protection Engine".padEnd(35))}│`);
      console.log(`  │  ${chalk.yellow("Port:")}     ${chalk.white(String(PORT).padEnd(35))}│`);
      console.log(`  │  ${chalk.yellow("By:")}       ${chalk.white("DJAMEL".padEnd(35))}│`);
      console.log(chalk.hex("#00b4d8")("  └──────────────────────────────────────────┘"));
      console.log();

      _loginLock = false;
      startProtection(api);
      await new Promise(r => setTimeout(r, 1500));

      if (io) io.emit("bot-status", {
        status: "online", uid, botName,
        prefix: config.prefix || "/",
        commands: global.GoatBot.commands.size,
      });

      // اختيار الاتصال
      const hasMsess = cookies.some(c => c.key === "m_sess");
      if (hasMsess && typeof api.listenMqtt === "function") startMqtt(api, 1, generation);
      else startPolling(api, 1, generation);
    });
  }

  tryLogin();
}

// ─── مراقبة account.txt ──────────────────────────────────────────────────────────
function watchAccount() {
  let debounce = null;
  fs.watch(ACCOUNT_PATH, () => {
    if (global._selfWrite) return;
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      log.info("WATCH", "account.txt تغيَّر — إعادة تسجيل الدخول…");
      startBot();
    }, 3000);
  });
}

// ─── Graceful shutdown ─────────────────────────────────────────────────────────
function shutdown(signal) {
  try { (global.log?.info || console.log)("MAIN", `${signal} — إيقاف نظيف…`); } catch (_) {}
  try { stopListening(); } catch (_) {}
  try { stopProtection(); } catch (_) {}
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

// ─── MAIN ──────────────────────────────────────────────────────────────────────
(async () => {
  try {
    printBanner();
    fs.ensureDirSync(path.join(ROOT, "data"));
    fs.ensureDirSync(path.join(ROOT, "database/data"));

    // 1. Dashboard أولاً — يفصل منفذ الواجهة عن منفذ فحص Railway عند اختلافهما
    await startDashboard(DASHBOARD_PORT, HEALTH_PORT);

    // 2. قاعدة البيانات
    try { await initDB(); log.ok("DB", "قاعدة البيانات جاهزة ✔"); }
    catch (e) { log.error("DB", `فشل تهيئة DB (غير حرج): ${e.message}`); }

    // 3. الأوامر
    global.GoatBot.commands = loadCommands(CMDS_DIR);
    global.commands          = global.GoatBot.commands;

    // 4. تعريض startBot للوحة التحكم
    global.startBot          = startBot;
    global.GoatBot.reLoginBot = startBot;

    // 5. تسجيل الدخول
    await startBot();

    // 6. مراقبة account.txt لإعادة التسجيل تلقائياً
    watchAccount();

  } catch (err) {
    console.error("[MAIN] خطأ فادح:", err?.message || err);
    process.exit(1);
  }
})();
