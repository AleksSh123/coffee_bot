import { existsSync, readFileSync } from "node:fs";

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  const content = readFileSync(filePath, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (!key || process.env[key] !== undefined) {
      continue;
    }

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function parseBoolean(value, defaultValue) {
  if (value === undefined) {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();

  if (["1", "true", "yes", "y", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "n", "off"].includes(normalized)) {
    return false;
  }

  return defaultValue;
}

function parsePositiveInteger(value, defaultValue) {
  const parsedValue = Number.parseInt(value ?? "", 10);

  if (Number.isFinite(parsedValue) && parsedValue > 0) {
    return parsedValue;
  }

  return defaultValue;
}

function parseScheduleTime(value, fallback = "09:00") {
  const normalizedValue = value ?? fallback;
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(normalizedValue);

  if (!match) {
    throw new Error(
      `PROMOTIONS_SCHEDULE_TIME must be in HH:MM format, received "${normalizedValue}"`
    );
  }

  return {
    timeLabel: normalizedValue,
    hour: Number.parseInt(match[1], 10),
    minute: Number.parseInt(match[2], 10)
  };
}

function requireEnv(name) {
  const value = process.env[name];

  if (!value) {
    console.error(`${name} is required`);
    process.exit(1);
  }

  return value;
}

export function loadConfig() {
  loadEnvFile(".env");

  const telegramToken = requireEnv("TELEGRAM_BOT_TOKEN");
  const tastyLogin = requireEnv("TASTY_LOGIN");
  const tastyPassword = requireEnv("TASTY_PASSWORD");
  const isRunningInDocker = existsSync("/.dockerenv");
  const promotionsScheduleTime = parseScheduleTime(process.env.PROMOTIONS_SCHEDULE_TIME);
  const promotionsScheduleTimeZone =
    process.env.PROMOTIONS_SCHEDULE_TIMEZONE ?? "Asia/Krasnoyarsk";
  const promotionsChannelId = process.env.PROMOTIONS_CHANNEL_ID?.trim() ?? "";
  const alertUsername = process.env.ALERT_USERNAME?.trim() ?? "";

  return {
    logging: {
      filePath: process.env.LOG_FILE_PATH?.trim() || null,
      echoTelegramMessages: parseBoolean(
        process.env.LOG_TELEGRAM_MESSAGES,
        !isRunningInDocker
      )
    },
    catalogRefresh: {
      intervalMs: parsePositiveInteger(process.env.CATALOG_REFRESH_INTERVAL_MS, 86_400_000),
      timeZone: promotionsScheduleTimeZone
    },
    telegram: {
      token: telegramToken,
      pollTimeout: Number.parseInt(process.env.TELEGRAM_POLL_TIMEOUT ?? "30", 10),
      apiBaseUrl: `https://api.telegram.org/bot${telegramToken}`
    },
    tasty: {
      apiBaseUrl: process.env.TASTY_API_BASE_URL ?? "https://api.tastycoffee.ru/api/v1",
      catalogSort: process.env.TASTY_CATALOG_SORT ?? "name-asc",
      login: tastyLogin,
      password: tastyPassword,
      privacyAgreement: parseBoolean(process.env.TASTY_PRIVACY_AGREEMENT ?? "true", true)
    },
    promotionsSchedule: {
      enabled: promotionsChannelId.length > 0,
      alertUsername,
      channelId: promotionsChannelId,
      timeLabel: promotionsScheduleTime.timeLabel,
      hour: promotionsScheduleTime.hour,
      minute: promotionsScheduleTime.minute,
      timeZone: promotionsScheduleTimeZone,
      checkIntervalMs: parsePositiveInteger(
        process.env.PROMOTIONS_SCHEDULE_CHECK_INTERVAL_MS,
        30_000
      ),
      stateFilePath:
        process.env.PROMOTIONS_SCHEDULE_STATE_FILE ?? ".runtime/promotions-schedule.json"
    }
  };
}
