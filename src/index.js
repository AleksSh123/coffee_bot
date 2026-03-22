import { createBotHandlers } from "./bot/handlers.js";
import { createPolling } from "./bot/polling.js";
import { createTelegramClient } from "./clients/telegram.js";
import { loadConfig } from "./config/env.js";
import { createDatabase } from "./db/client.js";
import { createApiServer } from "./http/server.js";
import { formatError } from "./lib/errors.js";
import { fetchJson } from "./lib/http.js";
import { createAppLogger, createFileLogger } from "./lib/logger.js";
import { createMessageLogger } from "./lib/message-logger.js";
import { createCatalogRefreshScheduler } from "./scheduler/catalog-refresh.js";
import { createPromotionsScheduler } from "./scheduler/promotions.js";
import { createMiniAppAuth } from "./services/miniapp-auth.js";
import { createOrderService } from "./services/order-service.js";
import { createTastyAuthService } from "./services/tasty-auth.js";
import { createCatalogService } from "./services/tasty-catalog.js";
import { createStore } from "./state/store.js";

const config = loadConfig();
const state = createStore();
const logger = createAppLogger({
  filePath: config.logging.filePath,
  level: config.logging.level
});
const telegramMessagesLogger = createFileLogger({
  filePath: config.logging.telegramMessagesFilePath,
  level: config.logging.telegramMessagesLevel
});
const loggedFetchJson = (url, options = {}) =>
  fetchJson(url, {
    ...options,
    logger
  });
const messageLogger = createMessageLogger({
  enabled: config.logging.echoTelegramMessages,
  level: config.logging.telegramMessagesLevel,
  logger: telegramMessagesLogger
});

const telegramClient = createTelegramClient({
  apiBaseUrl: config.telegram.apiBaseUrl,
  fetchJson: loggedFetchJson,
  logger,
  messageLogger
});

const tastyAuthService = createTastyAuthService({
  state,
  config,
  fetchJson: loggedFetchJson,
  logger
});

const catalogService = createCatalogService({
  state,
  config,
  authService: tastyAuthService,
  fetchJson: loggedFetchJson,
  logger
});
const database = config.api.enabled
  ? createDatabase({
      connectionString: config.database.url,
      logger
    })
  : null;
const miniAppAuth = config.api.enabled
  ? createMiniAppAuth({
      botToken: config.telegram.token,
      sessionSecret: config.api.sessionSecret,
      sessionTtlSeconds: config.api.sessionTtlSeconds,
      authMaxAgeSeconds: config.api.authMaxAgeSeconds,
      adminTelegramUserIds: config.api.adminTelegramUserIds
    })
  : null;
const orderService =
  config.api.enabled && database
    ? createOrderService({
        db: database,
        catalogService,
        logger
      })
    : null;
const apiServer =
  config.api.enabled && orderService && miniAppAuth
    ? createApiServer({
        config,
        catalogService,
        orderService,
        miniAppAuth,
        logger
      })
    : null;

const { handleUpdate, sendCatalogByButton } = createBotHandlers({
  catalogService,
  miniApp: config.miniApp,
  telegramClient,
  formatError,
  logger,
  messageLogger
});

const promotionsScheduler = createPromotionsScheduler({
  state,
  config,
  sendCatalogByButton,
  formatError,
  logger
});
const catalogRefreshScheduler = createCatalogRefreshScheduler({
  state,
  config,
  catalogService,
  formatError,
  logger
});

const { pollUpdates, shutdown } = createPolling({
  state,
  pollTimeout: config.telegram.pollTimeout,
  telegramClient,
  handleUpdate,
  formatError,
  logger
});

async function shutdownApp(signal) {
  catalogRefreshScheduler.stop();
  promotionsScheduler.stop();
  shutdown(signal);

  try {
    await apiServer?.stop();
  } catch (error) {
    logger.error("api.server.stop.failed", {
      error: formatError(error)
    });
  }

  try {
    await database?.close();
  } catch (error) {
    logger.error("database.connection.close.failed", {
      error: formatError(error)
    });
  }
}

process.on("SIGINT", () => {
  void shutdownApp("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdownApp("SIGTERM");
});

logger.info("app.lifecycle.starting", {
  node_env: process.env.NODE_ENV ?? null,
  log_file_path: config.logging.filePath,
  log_level: config.logging.level,
  telegram_messages_enabled: config.logging.echoTelegramMessages,
  telegram_messages_log_level: config.logging.telegramMessagesLevel,
  telegram_messages_log_file_path: config.logging.telegramMessagesFilePath,
  api_enabled: config.api.enabled,
  api_host: config.api.host,
  api_port: config.api.port,
  miniapp_public_url: config.miniApp.publicUrl
});
await telegramClient.verifyBot();

if (config.api.enabled && database) {
  await database.connect();
}

try {
  await catalogService.ensureCatalogReady(true);
} catch (error) {
  logger.error("catalog.initial_sync.failed", {
    error: formatError(error)
  });
}

await apiServer?.start();
catalogRefreshScheduler.start();
promotionsScheduler.start();
await pollUpdates();
