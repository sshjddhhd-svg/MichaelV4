/** Djamel-Fca Architecte Core — Human Typing Integration */
"use strict";
let apiRef = null;
let active = false;
function start(api) { apiRef = api; active = !!api; }
function wrapWithTyping(api) { start(api); }
function stop() { apiRef = null; active = false; }
module.exports = { start, wrapWithTyping, stop, isActive: () => active, getApi: () => apiRef };
