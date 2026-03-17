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

function normalizeTokenType(value) {
  if (!value) {
    return "Bearer";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatError(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function formatWeight(weight) {
  const numericWeight = Number(weight);

  if (!Number.isFinite(numericWeight) || numericWeight <= 0) {
    return null;
  }

  if (numericWeight >= 1000 && numericWeight % 1000 === 0) {
    return `${numericWeight / 1000} \u043a\u0433`;
  }

  return `${numericWeight} \u0433`;
}

function formatOfferType(type) {
  const offerTypeLabels = {
    bean_coffee: "\u0437\u0435\u0440\u043d\u043e",
    ground_coffee: "\u043c\u043e\u043b\u043e\u0442\u044b\u0439"
  };

  if (!type) {
    return null;
  }

  return offerTypeLabels[type] ?? type.replaceAll("_", " ");
}

function formatOfferLabel(offer) {
  const parts = [];
  const weight = formatWeight(offer.weight);
  const type = formatOfferType(offer.type);

  if (weight) {
    parts.push(weight);
  }

  if (type) {
    parts.push(type);
  }

  if (parts.length > 0) {
    return parts.join(", ");
  }

  return offer.name || "\u0432\u0430\u0440\u0438\u0430\u043d\u0442";
}

function formatPrice(price) {
  const numericPrice = Number(price);

  if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
    return "\u0446\u0435\u043d\u0430 \u043f\u043e \u0437\u0430\u043f\u0440\u043e\u0441\u0443";
  }

  return `${numericPrice.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} \u20bd`;
}

function getCategoryNameForItem(item, categoriesById) {
  return categoriesById.get(item.category_id)?.name ?? "\u0411\u0435\u0437 \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u0438";
}

function formatCatalogItemBlock(item) {
  const offers = Array.isArray(item.offers) ? item.offers : [];
  const lines = [escapeHtml(item.name)];

  if (offers.length === 0) {
    lines.push(`  - ${formatPrice(null)}`);
    return lines.join("\n");
  }

  for (const offer of offers) {
    lines.push(`  - ${escapeHtml(formatOfferLabel(offer))}: ${formatPrice(offer.price)}`);
  }

  return lines.join("\n");
}

function indentBlock(block, prefix = "\u00A0") {
  return block
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

function isHeaderBlock(block) {
  const normalizedBlock = block.trimStart();
  return (
    normalizedBlock.startsWith("<b>") ||
    normalizedBlock.startsWith("<u>") ||
    normalizedBlock.startsWith("<i>")
  );
}

function splitLongBlock(block, maxLength) {
  if (block.length <= maxLength) {
    return [block];
  }

  const lines = block.split("\n");
  const [title, ...details] = lines;
  const parts = [];
  let current = title;

  for (const detail of details) {
    const nextValue = `${current}\n${detail}`;

    if (nextValue.length > maxLength && current) {
      parts.push(current);
      current = `${title} (\u043f\u0440\u043e\u0434.)\n${detail}`;
      continue;
    }

    current = nextValue;
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}

function chunkBlocks(blocks, maxLength) {
  const chunks = [];
  let currentChunk = "";
  let lastBlockWasHeader = false;

  for (const block of blocks.flatMap((item) => splitLongBlock(item, maxLength))) {
    const separator = currentChunk ? (lastBlockWasHeader ? "\n" : "\n\n") : "";
    const nextChunk = currentChunk ? `${currentChunk}${separator}${block}` : block;

    if (nextChunk.length > maxLength && currentChunk) {
      chunks.push(currentChunk);
      currentChunk = block;
      lastBlockWasHeader = isHeaderBlock(block);
      continue;
    }

    currentChunk = nextChunk;
    lastBlockWasHeader = isHeaderBlock(block);
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

function buildCategoryBlocks(items, categoriesById = new Map()) {
  const categoryGroups = new Map();

  for (const item of items) {
    const categoryName = getCategoryNameForItem(item, categoriesById);

    if (!categoryGroups.has(categoryName)) {
      categoryGroups.set(categoryName, []);
    }

    categoryGroups.get(categoryName).push(item);
  }

  const sortedCategoryNames = [...categoryGroups.keys()].sort((left, right) =>
    left.localeCompare(right, "ru-RU")
  );
  const itemBlocks = [];

  for (const categoryName of sortedCategoryNames) {
    itemBlocks.push(`<b>\u041a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u044f: ${escapeHtml(categoryName)}</b>`);

    const sortedItems = [...categoryGroups.get(categoryName)].sort((left, right) =>
      left.name.localeCompare(right.name, "ru-RU")
    );

    for (const item of sortedItems) {
      itemBlocks.push(formatCatalogItemBlock(item));
    }
  }

  return itemBlocks;
}

function buildMessagesWithTitle(itemBlocks, title, itemsCount) {
  const bodyChunks = chunkBlocks(itemBlocks, 3200);

  return bodyChunks.map((chunk, index) => {
    const headerLines = [
      escapeHtml(title),
      `\u0422\u043e\u0432\u0430\u0440\u043e\u0432: ${itemsCount}`
    ];

    if (bodyChunks.length > 1) {
      headerLines.push(`\u0427\u0430\u0441\u0442\u044c ${index + 1}/${bodyChunks.length}`);
    }

    const header = headerLines.join("\n");

    return `${header}\n\n${chunk}`;
  });
}

function buildCatalogMessagesWithTitle(items, title, categoriesById = new Map()) {
  return buildMessagesWithTitle(buildCategoryBlocks(items, categoriesById), title, items.length);
}

function buildPromotionsMessagesWithTitle(items, title, categoriesById = new Map(), labelNames = []) {
  const itemBlocks = [];

  for (const labelName of labelNames) {
    const labelItems = items.filter((item) => item.label?.name === labelName);

    if (labelItems.length === 0) {
      continue;
    }

    itemBlocks.push(`<b><i><u>\u2B50 \u0410\u043a\u0446\u0438\u044f: ${escapeHtml(labelName)}</u></i></b>`);
    itemBlocks.push(...buildCategoryBlocks(labelItems, categoriesById).map((block) => indentBlock(block)));
  }

  return buildMessagesWithTitle(itemBlocks, title, items.length);
}

loadEnvFile(".env");

const priceButtonLabel = "\u041f\u0440\u0430\u0439\u0441";
const promotionsButtonLabel = "\u0410\u043a\u0446\u0438\u0438";
const sortOfWeekButtonLabel = "\u0421\u043e\u0440\u0442 \u043d\u0435\u0434\u0435\u043b\u0438";
const sortOfMonthButtonLabel = "\u0421\u043e\u0440\u0442 \u043c\u0435\u0441\u044f\u0446\u0430";
const microlotOfWeekButtonLabel = "\u041c\u0438\u043a\u0440\u043e\u043b\u043e\u0442 \u043d\u0435\u0434\u0435\u043b\u0438";
const catalogButtonConfigs = [
  {
    buttonLabel: priceButtonLabel,
    headerTitle: "Tasty Coffee",
    emptyMessage:
      "\u041a\u0430\u0442\u0430\u043b\u043e\u0433 \u043f\u043e\u043a\u0430 \u043f\u0443\u0441\u0442."
  },
  {
    buttonLabel: promotionsButtonLabel,
    headerTitle: promotionsButtonLabel,
    groupByPromotionType: true,
    labelNames: [
      microlotOfWeekButtonLabel,
      sortOfWeekButtonLabel,
      sortOfMonthButtonLabel
    ],
    emptyMessage:
      "\u0421\u0435\u0439\u0447\u0430\u0441 \u0432 \u043a\u0430\u0442\u0430\u043b\u043e\u0433\u0435 \u043d\u0435\u0442 \u0430\u043a\u0446\u0438\u043e\u043d\u043d\u044b\u0445 \u043f\u043e\u0437\u0438\u0446\u0438\u0439."
  },
  {
    buttonLabel: sortOfWeekButtonLabel,
    headerTitle: sortOfWeekButtonLabel,
    labelName: sortOfWeekButtonLabel,
    emptyMessage:
      "\u0421\u0435\u0439\u0447\u0430\u0441 \u0432 \u043a\u0430\u0442\u0430\u043b\u043e\u0433\u0435 \u043d\u0435\u0442 \u043f\u043e\u0437\u0438\u0446\u0438\u0439 \u0441 \u043c\u0435\u0442\u043a\u043e\u0439 \u00ab\u0421\u043e\u0440\u0442 \u043d\u0435\u0434\u0435\u043b\u0438\u00bb."
  },
  {
    buttonLabel: sortOfMonthButtonLabel,
    headerTitle: sortOfMonthButtonLabel,
    labelName: sortOfMonthButtonLabel,
    emptyMessage:
      "\u0421\u0435\u0439\u0447\u0430\u0441 \u0432 \u043a\u0430\u0442\u0430\u043b\u043e\u0433\u0435 \u043d\u0435\u0442 \u043f\u043e\u0437\u0438\u0446\u0438\u0439 \u0441 \u043c\u0435\u0442\u043a\u043e\u0439 \u00ab\u0421\u043e\u0440\u0442 \u043c\u0435\u0441\u044f\u0446\u0430\u00bb."
  },
  {
    buttonLabel: microlotOfWeekButtonLabel,
    headerTitle: microlotOfWeekButtonLabel,
    labelName: microlotOfWeekButtonLabel,
    emptyMessage:
      "\u0421\u0435\u0439\u0447\u0430\u0441 \u0432 \u043a\u0430\u0442\u0430\u043b\u043e\u0433\u0435 \u043d\u0435\u0442 \u043f\u043e\u0437\u0438\u0446\u0438\u0439 \u0441 \u043c\u0435\u0442\u043a\u043e\u0439 \u00ab\u041c\u0438\u043a\u0440\u043e\u043b\u043e\u0442 \u043d\u0435\u0434\u0435\u043b\u0438\u00bb."
  }
];
const promptMessage =
  "\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u043a\u043d\u043e\u043f\u043a\u0443: \u043f\u043e\u043b\u043d\u044b\u0439 \u043f\u0440\u0430\u0439\u0441 \u0438\u043b\u0438 \u043e\u0434\u043d\u0443 \u0438\u0437 \u0442\u0435\u043c\u0430\u0442\u0438\u0447\u0435\u0441\u043a\u0438\u0445 \u043f\u043e\u0434\u0431\u043e\u0440\u043e\u043a.";
const catalogUnavailableMessage =
  "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u043a\u0430\u0442\u0430\u043b\u043e\u0433. \u041f\u043e\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435 \u0435\u0449\u0435 \u0440\u0430\u0437 \u0447\u0443\u0442\u044c \u043f\u043e\u0437\u0436\u0435.";
const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
const pollTimeout = Number.parseInt(process.env.TELEGRAM_POLL_TIMEOUT ?? "30", 10);
const telegramApiBaseUrl = telegramToken ? `https://api.telegram.org/bot${telegramToken}` : null;
const tastyApiBaseUrl = process.env.TASTY_API_BASE_URL ?? "https://api.tastycoffee.ru/api/v1";
const tastyCatalogSort = process.env.TASTY_CATALOG_SORT ?? "name-asc";
const tastyLogin = process.env.TASTY_LOGIN;
const tastyPassword = process.env.TASTY_PASSWORD;
const tastyPrivacyAgreement = parseBoolean(process.env.TASTY_PRIVACY_AGREEMENT ?? "true", true);

if (!telegramToken) {
  console.error("TELEGRAM_BOT_TOKEN is required");
  process.exit(1);
}

if (!tastyLogin) {
  console.error("TASTY_LOGIN is required");
  process.exit(1);
}

if (!tastyPassword) {
  console.error("TASTY_PASSWORD is required");
  process.exit(1);
}

const state = {
  offset: 0,
  isShuttingDown: false,
  auth: {
    accessToken: null,
    tokenType: "Bearer",
    expiresAt: 0
  },
  catalog: {
    items: [],
    messages: [],
    categoriesById: new Map()
  },
  refreshPromise: null
};

async function fetchJson(url, { method = "GET", headers = {}, body } = {}) {
  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const rawText = await response.text();
  let payload = null;

  if (rawText) {
    try {
      payload = JSON.parse(rawText);
    } catch {
      payload = rawText;
    }
  }

  if (!response.ok) {
    const details = typeof payload === "string" ? payload : JSON.stringify(payload);
    const error = new Error(`Request failed: ${response.status} ${details}`);
    error.status = response.status;
    throw error;
  }

  return payload;
}

async function telegramApi(method, payload) {
  const data = await fetchJson(`${telegramApiBaseUrl}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: payload
  });

  if (!data.ok) {
    throw new Error(`Telegram API ${method} rejected request: ${JSON.stringify(data)}`);
  }

  return data.result;
}

async function loginToTasty() {
  const response = await fetchJson(`${tastyApiBaseUrl}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: {
      login: tastyLogin,
      password: tastyPassword,
      privacy_agreement: tastyPrivacyAgreement
    }
  });

  const data = response?.data;
  const accessToken = data?.access_token;
  const expiresInSeconds = Number.parseInt(`${data?.expires_in ?? 0}`, 10);

  if (!accessToken) {
    throw new Error("Tasty Coffee auth response did not include access_token");
  }

  const refreshSkewMs = 60_000;
  const expiresInMs = Number.isFinite(expiresInSeconds) && expiresInSeconds > 0
    ? expiresInSeconds * 1000
    : 0;

  state.auth = {
    accessToken,
    tokenType: normalizeTokenType(data?.token_type),
    expiresAt: Date.now() + Math.max(0, expiresInMs - refreshSkewMs)
  };

  console.log("Tasty Coffee token refreshed");
}

function hasValidTastyToken() {
  return Boolean(state.auth.accessToken) && Date.now() < state.auth.expiresAt;
}

async function fetchCategories() {
  const response = await fetchJson(`${tastyApiBaseUrl}/catalog/categories`, {
    headers: {
      Authorization: `${state.auth.tokenType} ${state.auth.accessToken}`
    }
  });

  const categories = Array.isArray(response?.data)
    ? response.data
    : Array.isArray(response?.data?.items)
      ? response.data.items
      : null;

  if (!Array.isArray(categories)) {
    throw new Error("Tasty Coffee categories response did not include a category array");
  }

  return new Map(categories.map((category) => [category.id, category]));
}

async function fetchCatalog() {
  const response = await fetchJson(
    `${tastyApiBaseUrl}/catalog/products?sort=${encodeURIComponent(tastyCatalogSort)}`,
    {
      headers: {
        Authorization: `${state.auth.tokenType} ${state.auth.accessToken}`
      }
    }
  );

  const items = Array.isArray(response?.data)
    ? response.data
    : Array.isArray(response?.data?.items)
      ? response.data.items
      : null;

  if (!Array.isArray(items)) {
    throw new Error("Tasty Coffee catalog response did not include a product array");
  }

  return items;
}

async function fetchCatalogData() {
  const [categoriesById, items] = await Promise.all([fetchCategories(), fetchCatalog()]);

  state.catalog = {
    items,
    categoriesById,
    messages: buildCatalogMessagesWithTitle(items, "Tasty Coffee", categoriesById)
  };

  console.log(
    `Tasty Coffee catalog loaded: ${items.length} items, ${categoriesById.size} categories`
  );
}

async function refreshCatalogCache(forceLogin) {
  if (forceLogin || !hasValidTastyToken()) {
    await loginToTasty();
  }

  try {
    await fetchCatalogData();
  } catch (error) {
    if (!forceLogin && error?.status === 401) {
      await loginToTasty();
      await fetchCatalogData();
      return;
    }

    throw error;
  }
}

async function ensureCatalogReady(forceRefresh = false) {
  const shouldRefresh =
    forceRefresh ||
    !hasValidTastyToken() ||
    state.catalog.items.length === 0 ||
    state.catalog.messages.length === 0;

  if (!shouldRefresh) {
    return state.catalog;
  }

  if (!state.refreshPromise) {
    state.refreshPromise = (async () => {
      try {
        await refreshCatalogCache(forceRefresh);
        return state.catalog;
      } finally {
        state.refreshPromise = null;
      }
    })();
  }

  return state.refreshPromise;
}

function buildMainKeyboard() {
  return {
    keyboard: [
      [{ text: priceButtonLabel }, { text: promotionsButtonLabel }],
      [{ text: sortOfWeekButtonLabel }, { text: sortOfMonthButtonLabel }],
      [{ text: microlotOfWeekButtonLabel }]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  };
}

async function sendMessage(chatId, text, options = {}) {
  const payload = {
    chat_id: chatId,
    text,
    reply_markup: buildMainKeyboard()
  };

  if (options.parseMode) {
    payload.parse_mode = options.parseMode;
  }

  await telegramApi("sendMessage", payload);
}

function getCatalogConfigByButton(buttonLabel) {
  return catalogButtonConfigs.find((config) => config.buttonLabel === buttonLabel) ?? null;
}

function filterCatalogItems(items, config) {
  if (!config?.labelName && !config?.labelNames) {
    return items;
  }

  if (config.labelName) {
    return items.filter((item) => item.label?.name === config.labelName);
  }

  const allowedLabels = new Set(config.labelNames);
  return items.filter((item) => allowedLabels.has(item.label?.name));
}

async function sendCatalogByButton(chatId, buttonLabel) {
  const config = getCatalogConfigByButton(buttonLabel);

  if (!config) {
    return false;
  }

  const catalog = await ensureCatalogReady();
  const filteredItems = filterCatalogItems(catalog.items, config);

  if (filteredItems.length === 0) {
    await sendMessage(chatId, config.emptyMessage);
    return true;
  }

  let messages = catalog.messages;

  if (config.groupByPromotionType) {
    messages = buildPromotionsMessagesWithTitle(
      filteredItems,
      config.headerTitle,
      catalog.categoriesById,
      config.labelNames
    );
  } else if (config.labelName || config.labelNames) {
    messages = buildCatalogMessagesWithTitle(filteredItems, config.headerTitle, catalog.categoriesById);
  }

  for (const message of messages) {
    await sendMessage(chatId, message, { parseMode: "HTML" });
  }

  return true;
}

async function verifyBot() {
  const bot = await telegramApi("getMe", {});
  console.log(`Authorized as @${bot.username}`);
}

async function warmUpCatalog() {
  try {
    await ensureCatalogReady(true);
  } catch (error) {
    console.error(`Initial Tasty Coffee sync failed: ${formatError(error)}`);
  }
}

async function handleUpdate(update) {
  if (!update?.message?.chat?.id || !update.message.text) {
    return;
  }

  const { chat, text } = update.message;

  if (getCatalogConfigByButton(text)) {
    try {
      await sendCatalogByButton(chat.id, text);
    } catch (error) {
      console.error(`Catalog send failed: ${formatError(error)}`);
      await sendMessage(chat.id, catalogUnavailableMessage);
    }

    return;
  }

  await sendMessage(chat.id, promptMessage);
}

async function pollUpdates() {
  while (!state.isShuttingDown) {
    try {
      const updates = await telegramApi("getUpdates", {
        offset: state.offset,
        timeout: pollTimeout,
        allowed_updates: ["message"]
      });

      for (const update of updates) {
        state.offset = update.update_id + 1;
        await handleUpdate(update);
      }
    } catch (error) {
      console.error(formatError(error));
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

function shutdown(signal) {
  console.log(`Received ${signal}, shutting down`);
  state.isShuttingDown = true;
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

console.log("Telegram bot is starting");
await verifyBot();
await warmUpCatalog();
await pollUpdates();
