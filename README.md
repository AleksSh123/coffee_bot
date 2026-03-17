# Telegram Price Bot

Minimal Telegram bot on Node.js. It authenticates with Telegram, logs in to the Tasty Coffee API, caches the access token until its expiration window, loads the product catalog together with categories, matches products by `category_id`, groups output by category, and sends either the full catalog or themed selections by button press.

## Requirements

- Bot token from `@BotFather`
- Tasty Coffee API credentials
- Docker

## Environment Variables

- `TELEGRAM_BOT_TOKEN` - Telegram bot token
- `TELEGRAM_POLL_TIMEOUT` - long polling timeout in seconds, default `30`
- `TASTY_LOGIN` - login for `https://api.tastycoffee.ru/api/v1/auth/login`
- `TASTY_PASSWORD` - password for `https://api.tastycoffee.ru/api/v1/auth/login`
- `TASTY_PRIVACY_AGREEMENT` - boolean flag sent to the login endpoint, default `true`
- `TASTY_API_BASE_URL` - API base URL, default `https://api.tastycoffee.ru/api/v1`
- `TASTY_CATALOG_SORT` - catalog sort query, default `name-asc`

The application automatically reads variables from `.env` if the file exists.

## Telegram Buttons

- `Прайс` - full catalog
- `Акции` - combined selection of `Микролот недели`, `Сорт недели`, and `Сорт месяца`, grouped by promotion type
- `Сорт недели` - only products with the `Сорт недели` label
- `Сорт месяца` - only products with the `Сорт месяца` label
- `Микролот недели` - only products with the `Микролот недели` label

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
docker run --rm --env-file .env coffee-bot
```

## Docker Compose

Create `.env` from `.env.example`, put your real values into it, then start:

```bash
docker compose up --build -d
```
