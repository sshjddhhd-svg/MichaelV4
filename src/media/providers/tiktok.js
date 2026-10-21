"use strict";
const axios = require("axios");
const isSupported = url => /(?:tiktok\.com|vm\.tiktok\.com)/i.test(String(url || ""));
async function resolve(url, options = {}) {
  const endpoint = options.apiUrl || process.env.TIKTOK_API_URL || "https://www.tikwm.com/api/";
  const res = await axios.get(endpoint, { params: { url, hd: options.hd ? 1 : 0 }, timeout: options.timeoutMs || 30000 });
  if (!res.data) throw new Error("TikTok: empty provider response");
  return res.data;
}
async function download(url, options = {}) {
  const data = await resolve(url, options);
  const direct = data?.data?.play || data?.data?.hdplay || data?.data?.music || data?.play;
  if (!direct) throw new Error("TikTok: provider returned no media URL");
  return direct;
}
module.exports = { name: "tiktok", isSupported, resolve, download };
