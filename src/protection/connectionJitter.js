/** Djamel-Fca Architecte Core — connectionJitter compatibility module. */
"use strict";
let active = false;
function start() { active = true; }
function stop() { active = false; }
function wrapSendMessage() { active = true; }
function wrapWithTyping() { active = true; }
module.exports = { start, stop, wrapSendMessage, wrapWithTyping, isActive: () => active };
