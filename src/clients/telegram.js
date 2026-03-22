import {
  catalogCategoriesSectionLabel,
  catalogUpdatedAtButtonLabel,
  microlotOfWeekButtonLabel,
  priceButtonLabel,
  promotionsButtonLabel,
  sortOfMonthButtonLabel,
  sortOfWeekButtonLabel
} from "../config/constants.js";

function buildKeyboardRows(buttonLabels, itemsPerRow = 2) {
  const rows = [];

  for (let index = 0; index < buttonLabels.length; index += itemsPerRow) {
    rows.push(
      buttonLabels.slice(index, index + itemsPerRow).map((label) => ({
        text: label
      }))
    );
  }

  return rows;
}

function buildKeyboard(categoryButtonLabels = []) {
  const categoryRows =
    categoryButtonLabels.length > 0
      ? [[{ text: catalogCategoriesSectionLabel }], ...buildKeyboardRows(categoryButtonLabels)]
      : [];

  return {
    keyboard: [
      [{ text: priceButtonLabel }, { text: promotionsButtonLabel }],
      [{ text: sortOfWeekButtonLabel }, { text: sortOfMonthButtonLabel }],
      [{ text: microlotOfWeekButtonLabel }, { text: catalogUpdatedAtButtonLabel }],
      ...categoryRows
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  };
}

function summarizeOutgoingText(text, fallback = "[empty text]") {
  if (typeof text !== "string") {
    return fallback;
  }

  const normalized = text.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return fallback;
  }

  return normalized.length > 80 ? `${normalized.slice(0, 80)}...` : normalized;
}

export function createTelegramClient({ apiBaseUrl, fetchJson, logger, messageLogger }) {
  let botUsername = null;

  async function callApi(method, payload) {
    const data = await fetchJson(`${apiBaseUrl}/${method}`, {
      logContext: `telegram.${method}`,
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

  async function sendMessage(chatId, text, options = {}) {
    const payload = {
      chat_id: chatId,
      text
    };

    if (options.includeKeyboard) {
      payload.reply_markup = buildKeyboard(options.categoryButtonLabels ?? []);
    }

    if (options.parseMode) {
      payload.parse_mode = options.parseMode;
    }

    const responseMessage = await callApi("sendMessage", payload);
    logger.info("telegram.message.sent");
    logger.debug("telegram.message.sent", {
      chat_id: responseMessage?.chat?.id ?? payload.chat_id,
      chat_type: responseMessage?.chat?.type ?? options.chatType ?? null,
      message_id: responseMessage?.message_id ?? null,
      text_preview: summarizeOutgoingText(payload.text)
    });
    messageLogger.logOutgoing({
      chatType: options.chatType,
      request: payload,
      responseMessage
    });
  }

  async function getUpdates({ offset, timeout, allowedUpdates }) {
    return callApi("getUpdates", {
      offset,
      timeout,
      allowed_updates: allowedUpdates
    });
  }

  async function verifyBot() {
    const bot = await callApi("getMe", {});
    botUsername = bot.username ?? null;
    logger.info("telegram.bot.authorized", {
      bot_id: bot.id,
      bot_username: bot.username
    });
    return bot;
  }

  return {
    getBotUsername: () => botUsername,
    getUpdates,
    sendMessage,
    verifyBot
  };
}
