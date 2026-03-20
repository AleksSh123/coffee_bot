import { createBotHandlers } from "./bot/handlers.js";
import { createPolling } from "./bot/polling.js";
import { createTelegramClient } from "./clients/telegram.js";
import { loadConfig } from "./config/env.js";
import { formatError } from "./lib/errors.js";
import { fetchJson } from "./lib/http.js";
import { createMessageLogger } from "./lib/message-logger.js";
import { createCatalogRefreshScheduler } from "./scheduler/catalog-refresh.js";
import { createPromotionsScheduler } from "./scheduler/promotions.js";
import { createTastyAuthService } from "./services/tasty-auth.js";
import { createCatalogService } from "./services/tasty-catalog.js";
import { createStore } from "./state/store.js";

const config = loadConfig();
const state = createStore();
const messageLogger = createMessageLogger({
  enabled: config.logging.echoTelegramMessages
});

const telegramClient = createTelegramClient({
  apiBaseUrl: config.telegram.apiBaseUrl,
  fetchJson,
  messageLogger
});

const tastyAuthService = createTastyAuthService({
  state,
  config,
  fetchJson
});

const catalogService = createCatalogService({
  state,
  config,
  authService: tastyAuthService,
  fetchJson
});

const { handleUpdate, sendCatalogByButton } = createBotHandlers({
  catalogService,
  telegramClient,
  formatError,
  messageLogger
});

const promotionsScheduler = createPromotionsScheduler({
  state,
  config,
  sendCatalogByButton,
  formatError
});
const catalogRefreshScheduler = createCatalogRefreshScheduler({
  state,
  config,
  catalogService,
  formatError
});

const { pollUpdates, shutdown } = createPolling({
  state,
  pollTimeout: config.telegram.pollTimeout,
  telegramClient,
  handleUpdate,
  formatError
});

function shutdownApp(signal) {
  catalogRefreshScheduler.stop();
  promotionsScheduler.stop();
  shutdown(signal);
}

process.on("SIGINT", () => shutdownApp("SIGINT"));
process.on("SIGTERM", () => shutdownApp("SIGTERM"));

console.log("Telegram bot is starting");
await telegramClient.verifyBot();

try {
  await catalogService.ensureCatalogReady(true);
} catch (error) {
  console.error(`Initial Tasty Coffee sync failed: ${formatError(error)}`);
}

catalogRefreshScheduler.start();
promotionsScheduler.start();
await pollUpdates();
