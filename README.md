# Telegram Price Bot

Минималистичный Telegram-бот на Node.js. Он авторизуется в Telegram, логинится в Tasty Coffee API, кэширует access token до окончания срока действия, загружает каталог товаров вместе с категориями, сопоставляет товары по `category_id`, группирует вывод по категориям и отправляет либо полный каталог, либо тематические подборки по нажатию кнопок.

## Требования

- токен бота от `@BotFather`
- учётные данные Tasty Coffee API
- Docker

## Переменные окружения

- `TELEGRAM_BOT_TOKEN` - токен Telegram-бота
- `TELEGRAM_POLL_TIMEOUT` - таймаут long polling в секундах, по умолчанию `30`
- `API_ENABLED` - включает встроенный HTTP API для Telegram Mini App, по умолчанию `false`
- `HTTP_HOST` - хост привязки HTTP API, по умолчанию `0.0.0.0`
- `HTTP_PORT` - порт HTTP API, по умолчанию `3000`
- `MINIAPP_PUBLIC_URL` - публичный HTTPS URL, который Telegram будет открывать для Mini App, например `https://example.com/miniapp`
- `MINIAPP_BUTTON_TEXT` - текст inline-кнопки запуска Mini App, по умолчанию `Открыть Mini App`
- `DATABASE_URL` - строка подключения к PostgreSQL для backend Mini App
- `ADMIN_TELEGRAM_USER_IDS` - список Telegram user id через запятую, которым будет доступна роль администратора в Mini App backend
- `API_SESSION_SECRET` - необязательный секрет для подписи bearer token API; если не указан, используется токен бота
- `API_SESSION_TTL_SECONDS` - время жизни bearer token API в секундах, по умолчанию `86400`
- `MINIAPP_AUTH_MAX_AGE_SECONDS` - максимально допустимый возраст `initData` от Mini App в секундах, по умолчанию `3600`
- `LOG_FILE_PATH` - необязательный путь к основному файлу логов приложения; каждая запись пишется в одну строку в формате `timestamp level module event status details`, при `INFO` детали компактные, при `DEBUG` сохраняется полный payload, а если путь задан, лог пишется и в консоль, и в файл
- `LOG_LEVEL` - минимальный уровень основного application log, допустимые значения: `debug`, `info`, `warn`, `error`, по умолчанию `info`
- `LOG_TELEGRAM_MESSAGES` - пишет входящие и исходящие Telegram message payloads в отдельный файл message log; по умолчанию `true` вне Docker и `false` внутри Docker
- `LOG_TELEGRAM_MESSAGES_LEVEL` - минимальный уровень Telegram message log; `debug` сохраняет текущий подробный формат payload, `info` пишет только направление, дату сообщения, текст, отправителя и название группы для групповых чатов; по умолчанию `debug`
- `LOG_TELEGRAM_MESSAGES_FILE_PATH` - необязательный путь к файлу Telegram message log; по умолчанию используется `telegram-messages.log` рядом с `LOG_FILE_PATH`, либо `.runtime/telegram-messages.log`, если `LOG_FILE_PATH` не задан
- `TASTY_LOGIN` - логин для `https://api.tastycoffee.ru/api/v1/auth/login`
- `TASTY_PASSWORD` - пароль для `https://api.tastycoffee.ru/api/v1/auth/login`
- `TASTY_PRIVACY_AGREEMENT` - булевый флаг, который отправляется в login endpoint, по умолчанию `true`
- `TASTY_API_BASE_URL` - базовый URL API, по умолчанию `https://api.tastycoffee.ru/api/v1`
- `TASTY_CATALOG_SORT` - параметр сортировки каталога, по умолчанию `name-asc`
- `CATALOG_REFRESH_INTERVAL_MS` - интервал принудительного обновления каталога в миллисекундах, по умолчанию `86400000` (раз в сутки)
- `ALERT_USERNAME` - необязательное имя, используемое в приветствии при отложенной публикации в канал; если пусто, приветствие начинается с `Привет!`
- `PROMOTIONS_CHANNEL_ID` - id Telegram-канала или `@channel_username`; если задан, включает публикацию акций по расписанию
- `PROMOTIONS_SCHEDULE_TIME` - еженедельный слот публикации в формате `<weekday> HH:MM`, по умолчанию `monday 09:00`; принимает английские названия дней недели, короткие формы вроде `mon`, цифры `1..7` и распространённые русские названия дней недели
- `PROMOTIONS_SCHEDULE_TIMEZONE` - IANA timezone для расписания, по умолчанию `Asia/Krasnoyarsk`
- `PROMOTIONS_SCHEDULE_CHECK_INTERVAL_MS` - интервал проверки scheduler в миллисекундах, по умолчанию `30000`
- `PROMOTIONS_SCHEDULE_STATE_FILE` - локальный файл, в котором хранится последний успешно опубликованный слот, по умолчанию `.runtime/promotions-schedule.json`

Если файл `.env` существует, приложение автоматически читает переменные из него.

По умолчанию бот также принудительно обновляет каталог в фоне раз в сутки, даже если никто его не запрашивает.
Бот хранит timestamp последнего успешного обновления каталога и может вернуть его в приватном чате.
HTTP-запросы и ответы логируются с редактированием чувствительных полей, синхронизация каталога пишет отдельные события, а Telegram message payloads можно хранить в отдельном файле.

## Использование в Telegram

В приватных чатах бот показывает reply keyboard со следующими кнопками:

- `Полный прайс` - полный каталог
- `Акции` - объединённая подборка `Микролот недели`, `Сорт недели` и `Сорт месяца`, сгруппированная по типу акции
- `Сорт недели` - только товары с меткой `Сорт недели`
- `Сорт месяца` - только товары с меткой `Сорт месяца`
- `Микролот недели` - только товары с меткой `Микролот недели`
- `Время обновления` - время последнего успешного обновления каталога
- `Открыть заказ` - отправляет inline-кнопку, открывающую Mini App, если настроен `MINIAPP_PUBLIC_URL`
- `Надкатегории` - строка-разделитель, после которой идут корневые разделы каталога вроде `Кофе`, `Чай`, `Шоколад`, `Мерч`

Навигация по динамическим категориям теперь иерархическая:

- сначала бот показывает надкатегории
- при выборе раздела бот переключает keyboard на следующий уровень дерева
- кнопка `⬅️ Назад` возвращает на уровень выше
- карточки товаров отправляются только при выборе конечной категории, в которой уже лежат позиции

В группах и супергруппах бот не отправляет reply keyboard и реагирует только на команду `/акции`.

## Mini App Backend

Если `API_ENABLED=true`, приложение запускает встроенный HTTP API для Telegram Mini App. Этот API использует PostgreSQL для хранения пользователей и заявок и работает с тем же in-memory кэшем каталога, что и бот.
Тот же процесс также раздаёт статический frontend Mini App по адресу `/miniapp`.
Mini App получает дерево категорий и тоже строит навигацию от надкатегорий к вложенным категориям.

Доступные endpoints:

- `GET /api/health`
- `POST /api/miniapp/auth` - валидирует Telegram Mini App `initData` и возвращает bearer token
- `GET /api/catalog`
- `GET /api/me`
- `GET /api/me/order`
- `POST /api/me/order/items`
- `PATCH /api/me/order/items/:itemId`
- `DELETE /api/me/order/items/:itemId`
- `POST /api/me/order/submit`
- `GET /api/me/orders`
- `GET /api/me/orders/:orderId`
- `GET /api/admin/orders`
- `GET /api/admin/orders/:orderId`
- `PATCH /api/admin/orders/:orderId/status`

Bearer token возвращается из `POST /api/miniapp/auth` и должен передаваться в остальные endpoints через заголовок `Authorization: Bearer <token>`.
Доступ администратора выдаётся, если Telegram user id аутентифицированного пользователя присутствует в `ADMIN_TELEGRAM_USER_IDS`.
Чтобы открывать Mini App из Telegram, укажи в `MINIAPP_PUBLIC_URL` публичный HTTPS URL для `/miniapp` за reverse proxy и используй кнопку `Открыть заказ` в приватном чате.

## Публикация в канал по расписанию

Если задан `PROMOTIONS_CHANNEL_ID`, бот публикует тот же контент, что и по `/акции`, в указанный Telegram-канал раз в неделю в день и время, заданные в `PROMOTIONS_SCHEDULE_TIME`.
Перед каждой публикацией по расписанию бот при необходимости принудительно делает новый логин в Tasty Coffee и заново загружает категории и каталог, чтобы в канал уходил актуальный снимок акционных товаров.

Плановые публикации добавляют приветствие:

- `Приветствую <ALERT_USERNAME>!`, а затем `Вот список акционных товаров на новой неделе.`, если `ALERT_USERNAME` задан
- `Привет!`, а затем `Вот список акционных товаров на новой неделе.`, если `ALERT_USERNAME` пустой

Чтобы после рестартов не было дублей, бот по умолчанию хранит последний успешно опубликованный слот в `.runtime/promotions-schedule.json`.

## Локальный запуск

Создай `.env` на основе `.env.example`, подставь реальный Telegram token и учётные данные Tasty Coffee, затем запусти:

Command Prompt:

```bat
npm start
```

PowerShell:

```powershell
npm start
```

## Запуск через Docker

Собери образ:

```bash
docker build -t coffee-bot .
```

Запусти контейнер:

```bash
sudo mkdir -p /var/log/coffee-bot
docker run --rm --env-file .env -e LOG_FILE_PATH=/app/logs/app.log -v /var/log/coffee-bot:/app/logs coffee-bot
```

## Docker Compose

Создай `.env` на основе `.env.example`, подставь реальные значения и затем запусти:

```bash
docker compose up --build -d
```

При запуске через `docker compose` основной лог сохраняется на хосте в `/var/log/coffee-bot/app.log`, Telegram message log сохраняется в `/var/log/coffee-bot/telegram-messages.log`, если `LOG_TELEGRAM_MESSAGES=true`, PostgreSQL поднимается автоматически, а Mini App backend вместе со статическим frontend доступны по адресу `http://localhost:3000/miniapp`.
