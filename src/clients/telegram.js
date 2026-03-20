import {
  catalogUpdatedAtButtonLabel,
  microlotOfWeekButtonLabel,
  priceButtonLabel,
  promotionsButtonLabel,
  sortOfMonthButtonLabel,
  sortOfWeekButtonLabel
} from "../config/constants.js";

function buildMainKeyboard() {
  return {
    keyboard: [
      [{ text: priceButtonLabel }, { text: promotionsButtonLabel }],
      [{ text: sortOfWeekButtonLabel }, { text: sortOfMonthButtonLabel }],
      [{ text: microlotOfWeekButtonLabel }, { text: catalogUpdatedAtButtonLabel }]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  };
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
      payload.reply_markup = buildMainKeyboard();
    }

    if (options.parseMode) {
      payload.parse_mode = options.parseMode;
    }

    const responseMessage = await callApi("sendMessage", payload);
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
