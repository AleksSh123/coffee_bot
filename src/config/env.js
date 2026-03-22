import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const logLevels = new Set(["debug", "info", "warn", "error"]);
const canonicalWeekdayLabels = {
  1: "monday",
  2: "tuesday",
  3: "wednesday",
  4: "thursday",
  5: "friday",
  6: "saturday",
  7: "sunday"
};
const weekdayNumbersByAlias = new Map([
  ["1", 1],
  ["monday", 1],
  ["mon", 1],
  ["понедельник", 1],
  ["пн", 1],
  ["2", 2],
  ["tuesday", 2],
  ["tue", 2],
  ["tues", 2],
  ["вторник", 2],
  ["вт", 2],
  ["3", 3],
  ["wednesday", 3],
  ["wed", 3],
  ["среда", 3],
  ["ср", 3],
  ["4", 4],
  ["thursday", 4],
  ["thu", 4],
  ["thur", 4],
  ["thurs", 4],
  ["четверг", 4],
  ["чт", 4],
  ["5", 5],
  ["friday", 5],
  ["fri", 5],
  ["пятница", 5],
  ["пт", 5],
  ["6", 6],
  ["saturday", 6],
  ["sat", 6],
  ["суббота", 6],
  ["сб", 6],
  ["7", 7],
  ["sunday", 7],
  ["sun", 7],
  ["воскресенье", 7],
  ["вс", 7]
]);

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

function parseLogLevel(value, defaultValue = "info") {
  if (value === undefined) {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();

  return logLevels.has(normalized) ? normalized : defaultValue;
}

function parseScheduleTime(value, fallback = "monday 09:00") {
  const normalizedValue = value?.trim() || fallback;
  const match = /^(\S+)\s+([01]\d|2[0-3]):([0-5]\d)$/.exec(normalizedValue);

  if (!match) {
    throw new Error(
      `PROMOTIONS_SCHEDULE_TIME must be in "<weekday> HH:MM" format, received "${normalizedValue}"`
    );
  }

  const weekday = weekdayNumbersByAlias.get(match[1].toLowerCase());

  if (!weekday) {
    throw new Error(
      `PROMOTIONS_SCHEDULE_TIME weekday must be one of monday..sunday, mon..sun, 1..7, or common Russian weekday names; received "${match[1]}"`
    );
  }

  const timeLabel = `${match[2]}:${match[3]}`;
  const weekdayLabel = canonicalWeekdayLabels[weekday];

  return {
    weekday,
    weekdayLabel,
    timeLabel,
    scheduleLabel: `${weekdayLabel} ${timeLabel}`,
    hour: Number.parseInt(match[2], 10),
    minute: Number.parseInt(match[3], 10)
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

function trimToNull(value) {
  const normalized = value?.trim();

  return normalized ? normalized : null;
}

function resolveTelegramMessagesFilePath({
  enabled,
  explicitFilePath,
  mainLogFilePath
}) {
  if (!enabled) {
    return null;
  }

  const activeExplicitFilePath = trimToNull(explicitFilePath);

  if (activeExplicitFilePath) {
    return activeExplicitFilePath;
  }

  if (mainLogFilePath) {
    return join(dirname(mainLogFilePath), "telegram-messages.log");
  }

  return ".runtime/telegram-messages.log";
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
  const logFilePath = trimToNull(process.env.LOG_FILE_PATH);
  const echoTelegramMessages = parseBoolean(
    process.env.LOG_TELEGRAM_MESSAGES,
    !isRunningInDocker
  );

  return {
    logging: {
      filePath: logFilePath,
      level: parseLogLevel(process.env.LOG_LEVEL, "info"),
      echoTelegramMessages,
      telegramMessagesLevel: parseLogLevel(process.env.LOG_TELEGRAM_MESSAGES_LEVEL, "debug"),
      telegramMessagesFilePath: resolveTelegramMessagesFilePath({
        enabled: echoTelegramMessages,
        explicitFilePath: process.env.LOG_TELEGRAM_MESSAGES_FILE_PATH,
        mainLogFilePath: logFilePath
      })
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
      weekday: promotionsScheduleTime.weekday,
      weekdayLabel: promotionsScheduleTime.weekdayLabel,
      timeLabel: promotionsScheduleTime.timeLabel,
      scheduleLabel: promotionsScheduleTime.scheduleLabel,
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
