/** Djamel-Fca Architecte Core — Session Connectivity Check */
"use strict";
const axios = require("axios");
let timer = null;
const rand = (a,b) => Math.floor(Math.random() * (b-a+1)) + a;

async function ping() {
  try {
    const api = global.GoatBot?.fcaApi;
    if (!api) return;
    const state = api.getAppState?.() || [];
    if (!state.length) return;
    const cookie = state.map(c => `${c.key}=${c.value}`).join("; ");
    const r = await axios.head("https://www.facebook.com/", {
      headers: { cookie }, timeout: 10000, validateStatus: null, maxRedirects: 2,
    });
    const location = String(r.headers?.location || "");
    if (/login|checkpoint/i.test(location)) {
      global.log?.warn?.("SESSION", "The session may require re-authentication");
      global.GoatBot.sessionState = "reauth_required";
    } else {
      global.GoatBot.sessionState = "ok";
    }
  } catch (e) {
    global.log?.warn?.("KEEP_ALIVE", e.message || String(e));
  }
}

function start() {
  if (timer || global.GoatBot?.config?.keepAlive?.enable === false) return;
  const c = global.GoatBot?.config?.keepAlive || {};
  const min = Math.max(1, Number(c.pingIntervalMinMinutes || 8)) * 60000;
  const max = Math.max(min, Number(c.pingIntervalMaxMinutes || 15) * 60000);
  const schedule = () => {
    timer = setTimeout(async () => { timer = null; await ping(); schedule(); }, rand(min, max));
    if (timer.unref) timer.unref();
  };
  schedule();
}
function stop() { if (timer) clearTimeout(timer); timer = null; }
module.exports = { start, stop, ping };
