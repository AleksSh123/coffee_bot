# Telegram Price Bot

Minimal Telegram bot on Node.js. It authenticates with Telegram, logs in to the Tasty Coffee API, caches the access token until its expiration window, loads the product catalog together with categories, matches products by `category_id`, groups output by category, and sends either the full catalog or themed selections by button press.

## Requirements

- Bot token from `@BotFather`
- Tasty Coffee API credentials
- Docker

## Environment Variables

- `TELEGRAM_BOT_TOKEN` - Telegram bot token
- `TELEGRAM_POLL_TIMEOUT` - long polling timeout in seconds, default `30`
- `LOG_FILE_PATH` - optional path to a log file with pretty-printed JSON records; when set, logs are written both to console and to this file
- `LOG_TELEGRAM_MESSAGES` - adds incoming and outgoing Telegram message payloads to the application log; defaults to `true` outside Docker and `false` in Docker
- `TASTY_LOGIN` - login for `https://api.tastycoffee.ru/api/v1/auth/login`
- `TASTY_PASSWORD` - password for `https://api.tastycoffee.ru/api/v1/auth/login`
- `TASTY_PRIVACY_AGREEMENT` - boolean flag sent to the login endpoint, default `true`
- `TASTY_API_BASE_URL` - API base URL, default `https://api.tastycoffee.ru/api/v1`
- `TASTY_CATALOG_SORT` - catalog sort query, default `name-asc`
- `CATALOG_REFRESH_INTERVAL_MS` - forced catalog refresh interval in milliseconds, default `86400000` (once per day)
- `ALERT_USERNAME` - optional name used in the scheduled channel greeting; when empty the greeting starts with `Привет!`
- `PROMOTIONS_CHANNEL_ID` - Telegram channel id or `@channel_username`; enables scheduled channel posting when set
- `PROMOTIONS_SCHEDULE_TIME` - daily publish time in `HH:MM`, default `09:00`
- `PROMOTIONS_SCHEDULE_TIMEZONE` - IANA timezone for the schedule, default `Asia/Krasnoyarsk`
- `PROMOTIONS_SCHEDULE_CHECK_INTERVAL_MS` - scheduler polling interval in milliseconds, default `30000`
- `PROMOTIONS_SCHEDULE_STATE_FILE` - local file used to remember the last published slot, default `.runtime/promotions-schedule.json`

The application automatically reads variables from `.env` if the file exists.

The bot also performs a forced background catalog refresh once per day by default, even if nobody requests the catalog.
The bot stores the timestamp of the last successful catalog refresh and can return it in a private chat.
HTTP requests and responses are logged with sensitive fields redacted, and catalog synchronization emits dedicated events.

## Telegram Usage

In private chats the bot shows a reply keyboard with:

- `Прайс` - full catalog
- `Акции` - combined selection of `Микролот недели`, `Сорт недели`, and `Сорт месяца`, grouped by promotion type
- `Сорт недели` - only products with the `Сорт недели` label
- `Сорт месяца` - only products with the `Сорт месяца` label
- `Микролот недели` - only products with the `Микролот недели` label

- `Время обновления` - last successful catalog refresh time

In group chats and supergroups the bot does not send a reply keyboard and responds only to the command `/акции`.

## Scheduled Channel Posting

If `PROMOTIONS_CHANNEL_ID` is set, the bot publishes the same content as `/акции` to the configured Telegram channel once per day at `PROMOTIONS_SCHEDULE_TIME`.
Before each scheduled publish, the bot forces a fresh Tasty Coffee login if needed and reloads categories plus catalog data, so the channel receives the latest promotions snapshot.

Scheduled posts prepend a greeting:

- `Приветствую <ALERT_USERNAME>!` followed by `Вот список акционных товаров на новой неделе.` when `ALERT_USERNAME` is set
- `Привет!` followed by `Вот список акционных товаров на новой неделе.` when `ALERT_USERNAME` is empty

To avoid duplicate posts after restarts, the bot stores the last successful schedule slot in `.runtime/promotions-schedule.json` by default.

## Local Run

Create `.env` from `.env.example`, put your real Telegram token and Tasty Coffee credentials there, then run:

Command Prompt:

```bat
npm start
```

PowerShell:

```powershell
npm start
```

## Docker Run

Build the image:

```bash
docker build -t coffee-bot .
```

Run the container:

```bash
docker run --rm --env-file .env -e LOG_FILE_PATH=/app/logs/app.log -v "$(pwd)/logs:/app/logs" coffee-bot
```

## Docker Compose

Create `.env` from `.env.example`, put your real values into it, then start:

```bash
docker compose up --build -d
```

With `docker compose`, logs are also persisted on the host in `./logs/app.log`.
