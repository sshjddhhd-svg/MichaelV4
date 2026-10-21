/**
 * Djamel-Fca Architecte Core — Unified media downloader
 * Railway-safe wrapper around yt-dlp + FFmpeg.
 * Supports public URLs from YouTube/YouTube Music, TikTok and SoundCloud.
 * Spotify is resolved to track metadata; direct Spotify audio extraction is not supported.
 */
"use strict";

const fs = require("fs-extra");
const path = require("path");
const os = require("os");
const getYtdlp = () => require("youtube-dl-exec");
const ffmpegPath = require("ffmpeg-static");

const ROOT_TMP = path.join(os.tmpdir(), "djamel-fca-media");
const MAX_MB = Math.max(5, Number(process.env.MEDIA_MAX_MB || 25));
const MAX_BYTES = MAX_MB * 1024 * 1024;

function ensureDir() { fs.ensureDirSync(ROOT_TMP); return ROOT_TMP; }
function safeFile(name, fallback = "media") {
  return String(name || fallback).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
}
function remove(file) { try { if (file) fs.removeSync(file); } catch (_) {} }
function isUrl(value) { return /^https?:\/\//i.test(String(value || "")); }
function isYouTube(value) { return /(?:youtube\.com|youtu\.be|music\.youtube\.com)/i.test(value); }
function isTikTok(value) { return /(?:tiktok\.com|vm\.tiktok\.com)/i.test(value); }
function isSoundCloud(value) { return /soundcloud\.com/i.test(value); }
function isSpotify(value) { return /open\.spotify\.com|spotify\.com/i.test(value); }

function getReferer(url, override) {
  const value = String(override || url || "");
  try {
    const parsed = new URL(value);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
  } catch (_) {}
  return isTikTok(url) ? "https://www.tiktok.com/" : "https://www.google.com/";
}

async function run(url, options = {}) {
  ensureDir();
  const output = options.output || path.join(ROOT_TMP, `${Date.now()}-${Math.random().toString(36).slice(2)}.%(ext)s`);
  const requestedHeight = Number(options.maxHeight ?? process.env.MEDIA_MAX_HEIGHT ?? 480);
  const maxHeight = Number.isFinite(requestedHeight)
    ? Math.max(144, Math.min(1080, Math.round(requestedHeight)))
    : 480;
  const videoFormat =
    `bv*[height<=${maxHeight}][ext=mp4]+ba[ext=m4a]` +
    `/b[height<=${maxHeight}][ext=mp4]/b[height<=${maxHeight}]`;
  const args = {
    noWarnings: true,
    noCallHome: true,
    preferFreeFormats: true,
    retries: 2,
    fragmentRetries: 2,
    extractorRetries: 2,
    socketTimeout: Number(process.env.MEDIA_TIMEOUT_SEC || 45),
    maxFilesize: `${MAX_MB}M`,
    output,
    format: options.audio ? "bestaudio/best" : videoFormat,
    mergeOutputFormat: options.audio ? "mp3" : "mp4",
    ffmpegLocation: process.env.FFMPEG_PATH || ffmpegPath || undefined,
    restrictFilenames: true,
    noPlaylist: true,
    addHeader: [
      "user-agent:Mozilla/5.0",
      `referer:${getReferer(url, options.referer)}`
    ],
  };
  if (options.audio) {
    args.extractAudio = true;
    args.audioFormat = "mp3";
    args.audioQuality = "128K";
  }
  if (options.writeInfo) args.dumpSingleJson = true;
  const result = await getYtdlp()(url, args);
  return result;
}

async function download(url, options = {}) {
  ensureDir();
  const ext = options.audio ? "mp3" : "mp4";
  const output = options.output || path.join(ROOT_TMP, `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
  remove(output);
  const template = output.replace(/\.[^.]+$/, ".%(ext)s");
  await run(url, { ...options, output: template });
  const exact = fs.existsSync(output) ? output : (() => {
    const dir = path.dirname(output), base = path.basename(output, path.extname(output));
    const candidates = fs.readdirSync(dir).filter(f => f.startsWith(base + "."));
    return candidates.length ? path.join(dir, candidates[0]) : output;
  })();
  if (!fs.existsSync(exact)) throw new Error("لم يتم إنشاء ملف الوسائط");
  if (fs.statSync(exact).size > MAX_BYTES) { remove(exact); throw new Error(`الملف أكبر من ${MAX_MB}MB`); }
  return exact;
}

module.exports = {
  ROOT_TMP, MAX_MB, MAX_BYTES, ensureDir, remove, safeFile,
  isUrl, isYouTube, isTikTok, isSoundCloud, isSpotify,
  download, run
};
