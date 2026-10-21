# Djamel-Fca Architecte

A clean, reusable bot foundation by DJAMEL.

**Core By Djamel · Library: Djamel-fca**

Start here: `ReadMeCoreDetails.md`.

1. Copy `config.example.json` to `config.json` and fill your runtime values.
2. Put your Facebook AppState/cookies in `account.txt`.
3. Add commands under `src/commands/`.
4. Use `src/media` for YouTube/TikTok/GIF/media operations.
5. Deploy with Railway using the included configuration.

## Dashboard / Railway contract
- `PORT=5000` — service/health port retained for Djamel-Fca Architecte compatibility.
- `DASHBOARD_PORT=8080` — dashboard + Socket.IO.
- Railway generated domain should target port `8080`.
- Railway healthcheck should use `/health` on `PORT=5000`.
- Set `DASHBOARD_PASSWORD` to a strong secret; `CHANGE_ME` is not accepted.
See `DashboardReadMeDetails.md` for the full deployment and maintenance contract.
