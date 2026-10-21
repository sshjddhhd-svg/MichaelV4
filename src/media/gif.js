"use strict";
const axios = require("axios");
const fs = require("fs-extra");
const os = require("os");
const path = require("path");
const ffmpeg = (() => { try { return require("ffmpeg-static"); } catch (_) { return process.env.FFMPEG_PATH || "ffmpeg"; } })();
const { spawn } = require("child_process");
const ROOT = path.join(os.tmpdir(), "djamel-fca-media", "gif");
fs.ensureDirSync(ROOT);
async function fetch(url) {
  const file = path.join(ROOT, `${Date.now()}-input`);
  const r = await axios.get(url, { responseType: "arraybuffer", timeout: 60000 });
  await fs.writeFile(file, Buffer.from(r.data));
  return file;
}
function toGif(input, options = {}) {
  const output = options.output || path.join(ROOT, `${Date.now()}.gif`);
  const fps = Math.min(30, Math.max(5, Number(options.fps || 12)));
  const width = Math.min(720, Math.max(160, Number(options.width || 480)));
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpeg, ["-y", "-i", input, "-vf", `fps=${fps},scale=${width}:-1:flags=lanczos`, "-loop", "0", output]);
    let err = ""; p.stderr.on("data", d => { err += d.toString(); });
    p.on("error", reject); p.on("close", code => code === 0 ? resolve(output) : reject(new Error(err.slice(-1000) || `ffmpeg exited ${code}`)));
  });
}
async function fromUrl(url, options = {}) { const input = await fetch(url); try { return await toGif(input, options); } finally { fs.remove(input).catch(() => {}); } }
module.exports = { ROOT, fetch, toGif, fromUrl };
