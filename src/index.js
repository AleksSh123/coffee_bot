import { createBotHandlers } from "./bot/handlers.js";
import { createPolling } from "./bot/polling.js";
import { createTelegramClient } from "./clients/telegram.js";
import { loadConfig } from "./config/env.js";
import { formatError } from "./lib/errors.js";
import { fetchJson } from "./lib/http.js";
import { createAppLogger } from "./lib/logger.js";
import { createMessageLogger } from "./lib/message-logger.js";
import { createCatalogRefreshScheduler } from "./scheduler/catalog-refresh.js";
import { createPromotionsScheduler } from "./scheduler/promotions.js";
import { createTastyAuthService } from "./services/tasty-auth.js";
import { createCatalogService } from "./services/tasty-catalog.js";
import { createStore } from "./state/store.js";

const config = loadConfig();
const state = createStore();
const logger = createAppLogger({
  filePath: config.logging.filePath
});
const loggedFetchJson = (url, options = {}) =>
  fetchJson(url, {
    ...options,
    logger
  });
const messageLogger = createMessageLogger({
  enabled: config.logging.echoTelegramMessages,
  logger
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

const { handleUpdate, sendCatalogByButton } = createBotHandlers({
  catalogService,
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

function shutdownApp(signal) {
  catalogRefreshScheduler.stop();
  promotionsScheduler.stop();
  shutdown(signal);
}

process.on("SIGINT", () => shutdownApp("SIGINT"));
process.on("SIGTERM", () => shutdownApp("SIGTERM"));

logger.info("app.starting", {
  node_env: process.env.NODE_ENV ?? null,
  log_file_path: config.logging.filePath
});
await telegramClient.verifyBot();

try {
  await catalogService.ensureCatalogReady(true);
} catch (error) {
  logger.error("catalog.initial_sync.failed", {
    error: formatError(error)
  });
}

catalogRefreshScheduler.start();
promotionsScheduler.start();
await pollUpdates();
