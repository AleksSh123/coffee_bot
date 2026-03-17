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

  return {
    logging: {
      echoTelegramMessages: parseBoolean(
        process.env.LOG_TELEGRAM_MESSAGES,
        !isRunningInDocker
      )
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
    }
  };
}
