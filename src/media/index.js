/**
 * Djamel-Fca Architecte — Media Service
 * Core By Djamel
 *
 * Stable API for commands. Provider-specific code lives in adapters so provider
 * changes do not require rewriting commands.
 */
"use strict";
const youtube = require("./providers/youtube");
const tiktok = require("./providers/tiktok");
const direct = require("./providers/direct");
const gif = require("./gif");

function providerFor(url) {
  if (youtube.isSupported(url)) return youtube;
  if (tiktok.isSupported(url)) return tiktok;
  return direct;
}
async function resolve(url, options = {}) { return providerFor(url).resolve(url, options); }
async function download(url, options = {}) { return providerFor(url).download(url, options); }
module.exports = { providerFor, resolve, download, youtube, tiktok, direct, gif };
