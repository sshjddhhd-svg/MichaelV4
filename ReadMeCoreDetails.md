# Djamel-Fca Architecte

**Core By Djamel — DJAMEL — Library: Djamel-fca**

Reusable foundation for building future Facebook/Messenger bots without carrying Djamel-Fca Architecte commands into every project.

## Structure

- `core-runtime-source.js` — runtime: config, login/session, MQTT, polling fallback, protection lifecycle, dashboard boot.
- `src/engine/` — globals, command loader, logging and event pipeline.
- `src/handlers/` — extension point for application handlers.
- `src/commands/` — intentionally empty command surface (`index.js` only).
- `src/protection/` — rate limiting, duplicate guard, keep-alive, session refresh, connection health and human-typing UX.
- `src/media/` — stable media API and provider adapters.
- `src/media/providers/youtube.js` — yt-dlp + YouTube search/info.
- `src/media/providers/tiktok.js` — TikTok provider adapter; endpoint configurable by env/config.
- `src/media/providers/direct.js` — generic URL downloader.
- `src/media/gif.js` — GIF conversion/fetch helpers via FFmpeg.
- `Djamel-fca/` — reusable Facebook client abstraction and attachment/media helpers.
- `src/dashboard/` — Railway-friendly dashboard server foundation.
- `database/` — database adapters retained as a foundation.
- `railway.toml`, `railway.json`, `Dockerfile`, `Procfile` — deployment foundation.

## Adding a command

Create `src/commands/youtube.js`:

```js
module.exports = {
  config: { name: "youtube", aliases: ["yt"], role: 0, category: "media" },
  async onStart({ api, event, args, message }) {
    // your command logic
  }
};
```

The loader discovers the file automatically. No edit to the core router is required.

## YouTube / TikTok architecture

Commands should call `require("../media")` rather than importing provider internals. This means a provider library/API can be replaced later without rewriting every command.

Examples:

```js
const media = require("../media");
const info = await media.youtube.resolve(url);
const file = await media.youtube.download(url, { audio: true });
const tiktok = await media.tiktok.resolve(url, { hd: true });
```

## GIF

`src/media/gif.js` exposes `fetch()`, `toGif()` and `fromUrl()` with configurable `fps`, `width`, and output path.

## Updating dependencies

1. Change only `package.json` first.
2. Run `npm install`.
3. Run `npm test` and `npm run lint`.
4. Test the relevant provider adapter.
5. Keep provider-specific compatibility fixes inside `src/media/providers/`.

## Session / cookies

`account.txt` is runtime state and is ignored by git. The FCA layer parses common cookie/AppState formats, validates sessions when possible, persists refreshed AppState, and the runtime can reconnect through MQTT or HTTP polling fallback.

Never commit real cookies, passwords, tokens, or `config.json` containing secrets.

## Railway

The project exposes `/health` and uses the supplied Railway start command. Keep secrets in Railway Variables rather than committing them.

## Ownership / attribution

This foundation intentionally keeps a visible attribution:

**Core By Djamel**

**DJAMEL — Djamel-fca**

It does not contain destructive anti-removal logic or hidden shutdown mechanisms. Attribution is implemented as normal source metadata so the core remains maintainable and auditable.
