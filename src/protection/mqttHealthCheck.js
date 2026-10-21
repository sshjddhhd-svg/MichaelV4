/** Djamel-Fca Architecte Core — Connection Health Monitor */
"use strict";
let timer = null;
let restartCount = 0;
const rand = (a,b) => Math.floor(Math.random()*(b-a+1))+a;

function markActivity() { global.lastMqttActivity = Date.now(); }
function cfg() {
  const c = global.GoatBot?.config?.mqttHealthCheck || {};
  return { enable:c.enable !== false, silent:(Number(c.silentTimeoutMinutes)||10)*60000,
    min:(Number(c.checkIntervalMinMinutes)||2)*60000, max:(Number(c.checkIntervalMaxMinutes)||5)*60000,
    maxRestarts:Number(c.maxRestarts)||5, notify:c.notifyAdmins !== false };
}

async function check() {
  const c = cfg();
  if (!c.enable || !global.GoatBot?.fcaApi) return;
  const last = global.lastMqttActivity || Date.now();
  if (Date.now() - last < c.silent) { restartCount = 0; return; }
  if (restartCount >= c.maxRestarts) return;
  restartCount++;
  global.log?.warn?.("CONNECTION", `No events for ${Math.round((Date.now()-last)/60000)}m; reconnect #${restartCount}`);
  try { await global.GoatBot.reLoginBot?.("mqtt-health"); } catch (e) { global.log?.warn?.("CONNECTION", e.message || String(e)); }
}
function schedule() {
  if (timer) return;
  const c = cfg();
  timer = setTimeout(async () => { timer = null; await check(); schedule(); }, rand(c.min,c.max));
  if (timer.unref) timer.unref();
}
function startHealthCheck() { if (!timer && cfg().enable) schedule(); }
function stopHealthCheck() { if (timer) clearTimeout(timer); timer = null; restartCount = 0; }
module.exports = { startHealthCheck, stopHealthCheck, markActivity, check };
