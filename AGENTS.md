# AGENTS

## Project

- Repository: `coffee_bot`
- Runtime: Node.js 20+
- Module format: ESM
- Main entry point: `src/index.js`
- Primary purpose: Telegram bot for the Tasty Coffee catalog with a built-in backend for a Telegram Mini App

## Current Components

- Telegram bot long polling: `src/bot/`, `src/clients/telegram.js`
- Catalog sync from Tasty Coffee API: `src/services/tasty-catalog.js`, `src/services/tasty-auth.js`
- Logging: `src/lib/logger.js`, `src/lib/message-logger.js`
- Mini App backend API: `src/http/server.js`
- Mini App auth/session logic: `src/services/miniapp-auth.js`
- Orders and admin workflow: `src/services/order-service.js`
- PostgreSQL schema/bootstrap: `src/db/`
- Static Mini App frontend: `web/miniapp/`

## Run And Verify

- Install dependencies: `npm install`
- Start app locally: `npm start`
- Syntax check JS files: `node --check <file ...>`
- Validate compose file: `docker compose config`
- Start full stack in Docker: `docker compose up --build -d`

There is no formal test suite in the repo right now.
For most changes, verification should be done with:

- `node --check` on changed modules
- targeted smoke scripts via `node --input-type=module`
- `docker compose config` when Docker or env wiring changes

## Environment

Important variables live in:

- `.env.example`
- `src/config/env.js`

Key groups:

- Telegram bot: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_POLL_TIMEOUT`
- Tasty Coffee API: `TASTY_LOGIN`, `TASTY_PASSWORD`, `TASTY_API_BASE_URL`
- Logging: `LOG_FILE_PATH`, `LOG_LEVEL`, `LOG_TELEGRAM_MESSAGES*`
- Promotions scheduler: `PROMOTIONS_*`
- Mini App/backend: `API_ENABLED`, `HTTP_HOST`, `HTTP_PORT`, `MINIAPP_PUBLIC_URL`, `DATABASE_URL`, `ADMIN_TELEGRAM_USER_IDS`

## Architecture Notes

- The bot and Mini App backend run in the same Node process.
- Catalog data is cached in memory in the shared store.
- The Mini App backend reuses the same catalog service as the bot.
- Order data is persistent and stored in PostgreSQL.
- Mini App identity must be validated from Telegram `initData` on the server side.
- Admin access is controlled by `ADMIN_TELEGRAM_USER_IDS`.

## Editing Guidance

- Keep changes consistent with the existing minimal stack. Do not introduce large frameworks without a clear reason.
- Prefer extending current services over duplicating business logic.
- Reuse the catalog cache instead of adding parallel catalog fetch paths.
- Keep Telegram keyboard behavior intact unless the task explicitly changes UX.
- For Mini App changes, ensure both the static frontend and `/api/...` contract stay aligned.
- When changing DB behavior, update `src/db/schema.js` and verify the affected order flow end-to-end.

## Deployment Notes

- Docker image must include both `src/` and `web/`.
- `compose.yaml` currently starts both the bot service and PostgreSQL.
- Mini App needs a public HTTPS URL in front of `/miniapp` for Telegram clients.

## Known Gaps

- No automated tests yet
- No migrations framework beyond bootstrap schema creation
- No reverse proxy or TLS config in this repo
- No production frontend build pipeline; Mini App frontend is served as static files
