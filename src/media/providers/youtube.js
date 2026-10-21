"use strict";
const ffmpegPath = (() => { try { return require("ffmpeg-static"); } catch (_) { return process.env.FFMPEG_PATH || null; } })();
const getYtdlp = () => require("youtube-dl-exec");
const fs = require("fs-extra");
const os = require("os");
const path = require("path");
const ytSearch = require("yt-search");
const ROOT = path.join(os.tmpdir(), "djamel-fca-media", "youtube");
const isSupported = url => /(?:youtube\.com|youtu\.be|music\.youtube\.com)/i.test(String(url || ""));
async function search(query) { return ytSearch(query); }
async function resolve(url, options = {}) {
  const args = { dumpSingleJson: true, noWarnings: true, noCallHome: true, noPlaylist: true, skipDownload: true, retries: 2, extractorRetries: 2, socketTimeout: options.timeoutSec || 45 };
  return getYtdlp()(url, args);
}
async function download(url, options = {}) {
  fs.ensureDirSync(ROOT);
  const audio = !!options.audio;
  const ext = audio ? "mp3" : "mp4";
  const out = options.output || path.join(ROOT, `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
  const maxHeight = Math.min(1080, Math.max(144, Number(options.maxHeight || 720)));
  const args = {
    output: out.replace(/\.[^.]+$/, ".%(ext)s"), noWarnings: true, noCallHome: true, noPlaylist: true,
    retries: 2, fragmentRetries: 2, extractorRetries: 2, socketTimeout: options.timeoutSec || 60,
    ffmpegLocation: process.env.FFMPEG_PATH || ffmpegPath || undefined,
    format: audio ? "bestaudio/best" : `bv*[height<=${maxHeight}][ext=mp4]+ba[ext=m4a]/b[height<=${maxHeight}][ext=mp4]/b`,
    mergeOutputFormat: audio ? "mp3" : "mp4", restrictFilenames: true
  };
  if (audio) { args.extractAudio = true; args.audioFormat = "mp3"; args.audioQuality = options.audioQuality || "128K"; }
  await getYtdlp()(url, args);
  const dir = path.dirname(out), base = path.basename(out, path.extname(out));
  const found = fs.existsSync(out) ? out : fs.readdirSync(dir).find(f => f.startsWith(base + "."));
  if (!found) throw new Error("YouTube: media file was not created");
  return path.isAbsolute(found) ? found : path.join(dir, found);
}
module.exports = { name: "youtube", isSupported, search, resolve, download };
