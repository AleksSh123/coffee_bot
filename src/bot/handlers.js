import {
  buildCatalogMessagesWithTitle,
  buildPromotionsMessagesWithTitle
} from "../catalog/formatters.js";
import { filterCatalogItems, getCatalogConfigByButton } from "../catalog/filters.js";
import {
  catalogNotUpdatedYetMessage,
  catalogUpdatedAtButtonLabel,
  catalogUnavailableMessage,
  promptMessage,
  promotionsButtonLabel,
  promotionsGroupCommand
} from "../config/constants.js";

export function createBotHandlers({
  catalogService,
  telegramClient,
  formatError,
  logger,
  messageLogger
}) {
  function summarizeIncomingText(text, fallback = "[non-text message]") {
    if (typeof text !== "string") {
      return fallback;
    }

    const normalized = text.replace(/\s+/g, " ").trim();

    if (!normalized) {
      return "[empty text]";
    }

    return normalized.length > 80 ? `${normalized.slice(0, 80)}...` : normalized;
  }

  function prependMessagePrefix(messages, messagePrefix) {
    if (!messagePrefix || messages.length === 0) {
      return messages;
    }

    return [`${messagePrefix}\n\n${messages[0]}`, ...messages.slice(1)];
  }

  function isPrivateChat(chat) {
    return chat?.type === "private";
  }

  function isGroupPromotionsCommand(text) {
    if (!text) {
      return false;
    }

    const normalizedText = text.trim().toLowerCase();
    const botUsername = telegramClient.getBotUsername()?.toLowerCase();

    if (normalizedText === promotionsGroupCommand) {
      return true;
    }

    if (!botUsername) {
      return false;
    }

    return normalizedText === `${promotionsGroupCommand}@${botUsername}`;
  }

  function buildCatalogRefreshMessage() {
    const refreshInfo = catalogService.getLastRefreshInfo();

    if (!refreshInfo) {
      return catalogNotUpdatedYetMessage;
    }

    return (
      `\u041a\u0430\u0442\u0430\u043b\u043e\u0433 \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d: ${refreshInfo.formatted}\n` +
      `\u0427\u0430\u0441\u043e\u0432\u043e\u0439 \u043f\u043e\u044f\u0441: ${refreshInfo.timeZone}`
    );
  }

  async function sendCatalogByButton(chat, buttonLabel, options = {}) {
    const config = getCatalogConfigByButton(buttonLabel);

    if (!config) {
      return false;
    }

    const catalog = await catalogService.ensureCatalogReady(Boolean(options.forceRefresh));
    const filteredItems = filterCatalogItems(catalog.items, config);
    const includeKeyboard = isPrivateChat(chat);

    if (filteredItems.length === 0) {
      await telegramClient.sendMessage(chat.id, config.emptyMessage, {
        chatType: chat.type,
        includeKeyboard
      });
      return true;
    }

    let messages = catalog.messages;

    if (config.groupByPromotionType) {
      messages = buildPromotionsMessagesWithTitle(
        filteredItems,
        config.headerTitle,
        catalog.categoriesById,
        config.labelNames,
        catalog.pricesValidText
      );
    } else if (config.labelName || config.labelNames) {
      messages = buildCatalogMessagesWithTitle(
        filteredItems,
        config.headerTitle,
        catalog.categoriesById
      );
    }

    messages = prependMessagePrefix(messages, options.messagePrefix);

    for (const message of messages) {
      await telegramClient.sendMessage(chat.id, message, {
        chatType: chat.type,
        includeKeyboard,
        parseMode: "HTML"
      });
    }

    return true;
  }

  async function handleUpdate(update) {
    if (!update?.message?.chat?.id) {
      return;
    }

    const { chat, text } = update.message;
    logger.info("telegram.message.received");
    logger.debug("telegram.message.received", {
      chat_id: chat.id,
      chat_type: chat.type,
      sender_id: update.message.from?.id ?? null,
      text_preview: summarizeIncomingText(text ?? update.message.caption)
    });
    messageLogger.logIncoming({
      updateId: update.update_id,
      message: update.message
    });

    if (!text) {
      return;
    }

    const isPrivate = isPrivateChat(chat);
    const isCatalogUpdatedAtRequest = isPrivate && text === catalogUpdatedAtButtonLabel;
    const requestedButton = isPrivate
      ? getCatalogConfigByButton(text)?.buttonLabel
      : isGroupPromotionsCommand(text)
        ? promotionsButtonLabel
        : null;

    if (isCatalogUpdatedAtRequest) {
      await telegramClient.sendMessage(chat.id, buildCatalogRefreshMessage(), {
        chatType: chat.type,
        includeKeyboard: true
      });
      return;
    }

    if (requestedButton) {
      try {
        await sendCatalogByButton(chat, requestedButton);
      } catch (error) {
        logger.error("catalog.send.failed", {
          chat_id: chat.id,
          chat_type: chat.type,
          requested_button: requestedButton,
          error: formatError(error)
        });
        await telegramClient.sendMessage(chat.id, catalogUnavailableMessage, {
          chatType: chat.type,
          includeKeyboard: isPrivate
        });
      }

      return;
    }

    if (!isPrivate) {
      return;
    }

    await telegramClient.sendMessage(chat.id, promptMessage, {
      chatType: chat.type,
      includeKeyboard: true
    });
  }

  return {
    handleUpdate,
    sendCatalogByButton
  };
}
