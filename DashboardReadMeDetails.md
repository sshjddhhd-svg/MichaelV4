# DashboardReadMeDetails — Djamel-Fca Architecte

## Purpose
The dashboard is a **neutral Core UI foundation**, not a copy of the the original release dashboard. The bundled `src/dashboard/public/index.html` is intentionally minimal so a future bot author can replace the UI without changing the runtime contract.

## Runtime contract
- **Bot / Railway health port:** `5000` (`PORT`)
- **Dashboard HTTP + Socket.IO:** `8080` (`DASHBOARD_PORT`)
- Bind address: `0.0.0.0`
- Health endpoints: `/health` and `/ping`
- Dashboard assets: `src/dashboard/public/`
- Dashboard backend: `src/dashboard/server.js`

The bot does not require an HTTP port for Facebook/MQTT itself; port 5000 is kept as the Core health/service port for compatibility with the original the original release deployment contract.

## Railway Generate Domain
Railway injects `PORT` and uses it for health checks. This Core therefore keeps `/health` on port 5000 while the dashboard listens on 8080. When the service listens on multiple ports, Railway lets the public domain use a selected **Target Port**. Generate the domain and set its Target Port to **8080** so the domain opens the dashboard. Keep the Railway healthcheck path as `/health` and `PORT=5000`.

If Railway auto-detects the wrong port, explicitly set:

```text
PORT=5000
DASHBOARD_PORT=8080
```

Then set the generated domain target port to `8080`.

## Dashboard security
Set `DASHBOARD_PASSWORD` as a Railway variable or replace `dashboard.password` in `config.json` with a strong secret. `CHANGE_ME` is rejected by the login endpoint. Never commit real cookies or dashboard passwords.

## Facebook session / cookies
The Core accepts the supported cookie/AppState formats through `Djamel-fca`. A successful login stores the fresh AppState in `account.txt` with restrictive file permissions where the platform supports them.

The session layer:
1. parses and validates cookies;
2. checks mandatory `c_user` + `xs` values;
3. performs a live session check before login;
4. logs in through `Djamel-fca`;
5. saves the fresh AppState returned by the API;
6. monitors AppState changes and persists them;
7. checks session connectivity periodically;
8. reconnects through MQTT, then HTTP long-poll, then the custom poller.

This is **session-state maintenance**, not a promise to refresh an expired Facebook credential. If Facebook invalidates a session or requires re-authentication, the Core reports `reauth_required` and needs a new valid session.

## Building a new UI
Replace only `src/dashboard/public/` for visual changes. Keep the API contract in `src/dashboard/server.js` stable. For a larger UI, recommended structure:

```text
src/dashboard/
  server.js
  public/
    index.html
    assets/
      css/
      js/
      img/
```

The bot Core should not contain bot-specific page names, logos, command panels, or the original release-specific visual layouts.

## Building commands
Add one file per command under `src/commands/`.

```text
src/commands/
  _template.js
  youtube.js
  tiktok.js
  gif.js
```

The loader discovers command modules automatically. Media functionality belongs in `src/media/` and should be consumed by commands through adapters rather than embedding download logic inside every command.

## Media maintenance
- `src/media/providers/youtube.js` — YouTube adapter.
- `src/media/providers/tiktok.js` — TikTok adapter.
- `src/media/providers/direct.js` — direct HTTP media.
- `src/media/gif.js` — GIF conversion helpers.
- `Djamel-fca/lib/media.js` — Facebook attachment/media helpers.

When a provider breaks after an upstream change, update the adapter and its dependency without rewriting the event engine or commands.

## Ownership / attribution
Core attribution is intentionally visible and maintainable:
- `Core By Djamel`
- `Djamel-fca`
- `DJAMEL`

There is no destructive anti-removal mechanism. A future project can extend or replace the UI and commands without hidden sabotage logic.
