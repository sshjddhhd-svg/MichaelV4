"use strict";
const axios = require("axios");
const fs = require("fs-extra");
const os = require("os");
const path = require("path");
const isSupported = url => /^https?:\/\//i.test(String(url || ""));
async function resolve(url) { return { url }; }
async function download(url, options = {}) {
  const dir = options.dir || path.join(os.tmpdir(), "djamel-fca-media", "direct");
  fs.ensureDirSync(dir);
  const name = options.filename || `media-${Date.now()}`;
  const out = path.join(dir, name);
  const res = await axios.get(url, { responseType: "arraybuffer", timeout: options.timeoutMs || 60000, maxRedirects: 10 });
  await fs.writeFile(out, Buffer.from(res.data));
  return out;
}
module.exports = { name: "direct", isSupported, resolve, download };
