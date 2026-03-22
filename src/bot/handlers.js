import {
  buildCatalogMessagesWithTitle,
  buildPromotionsMessagesWithTitle
} from "../catalog/formatters.js";
import { filterCatalogItems, getCatalogConfigByButton } from "../catalog/filters.js";
import {
  catalogCategoriesSectionLabel,
  catalogNotUpdatedYetMessage,
  catalogUpdatedAtButtonLabel,
  catalogUnavailableMessage,
  miniAppButtonLabel,
  miniAppOpenPromptMessage,
  miniAppUnavailableMessage,
  promptMessage,
  promotionsButtonLabel,
  promotionsGroupCommand
} from "../config/constants.js";

export function createBotHandlers({
  catalogService,
  miniApp,
  telegramClient,
  formatError,
  logger,
  messageLogger
}) {
  function hasMiniAppEntry() {
    return Boolean(miniApp?.publicUrl);
  }

  function getCategoryButtonLabels() {
    return catalogService.getAvailableCategories().map((category) => category.name);
  }

  function buildPrivateKeyboardOptions() {
    return {
      includeKeyboard: true,
      categoryButtonLabels: getCategoryButtonLabels(),
      includeMiniAppButton: hasMiniAppEntry()
    };
  }

  async function sendMiniAppPrompt(chat) {
    if (!hasMiniAppEntry()) {
      await telegramClient.sendMessage(chat.id, miniAppUnavailableMessage, {
        chatType: chat.type,
        ...buildPrivateKeyboardOptions()
      });
      return;
    }

    await telegramClient.sendMessage(chat.id, miniAppOpenPromptMessage, {
      chatType: chat.type,
      replyMarkup: {
        inline_keyboard: [
          [
            {
              text: miniApp.buttonText,
              web_app: {
                url: miniApp.publicUrl
              }
            }
          ]
        ]
      }
    });
  }

  function findCategoryByButtonLabel(categoriesById, buttonLabel) {
    return [...categoriesById.values()].find((category) => category?.name === buttonLabel) ?? null;
  }

  function buildCategoryCatalogConfig(category) {
    return {
      buttonLabel: category.name,
      headerTitle: category.name,
      categoryId: category.id,
      emptyMessage: `Сейчас в каталоге нет позиций в категории «${category.name}».`
    };
  }

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

  async function sendCatalogUnavailable(chat, requestedButton, error) {
    logger.error("catalog.send.failed", {
      chat_id: chat.id,
      chat_type: chat.type,
      requested_button: requestedButton,
      error: formatError(error)
    });
    await telegramClient.sendMessage(chat.id, catalogUnavailableMessage, {
      chatType: chat.type,
      ...(isPrivateChat(chat) ? buildPrivateKeyboardOptions() : {})
    });
  }

  async function sendCatalogByButton(chat, buttonLabel, options = {}) {
    const catalog = await catalogService.ensureCatalogReady(Boolean(options.forceRefresh));
    const config =
      getCatalogConfigByButton(buttonLabel) ??
      (() => {
        const category = findCategoryByButtonLabel(catalog.categoriesById, buttonLabel);
        return category ? buildCategoryCatalogConfig(category) : null;
      })();

    if (!config) {
      return false;
    }

    const filteredItems = filterCatalogItems(catalog.items, config);
    const includeKeyboard = isPrivateChat(chat);
    const keyboardOptions = includeKeyboard ? buildPrivateKeyboardOptions() : {};

    if (filteredItems.length === 0) {
      await telegramClient.sendMessage(chat.id, config.emptyMessage, {
        chatType: chat.type,
        ...keyboardOptions
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
    } else if (
      (config.categoryId !== undefined && config.categoryId !== null) ||
      config.labelName ||
      config.labelNames
    ) {
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
        ...keyboardOptions,
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
    const isCategorySectionTap = isPrivate && text === catalogCategoriesSectionLabel;
    const isMiniAppRequest = isPrivate && text === miniAppButtonLabel;
    const requestedButton = isPrivate
      ? getCatalogConfigByButton(text)?.buttonLabel
      : isGroupPromotionsCommand(text)
        ? promotionsButtonLabel
        : null;

    if (isCatalogUpdatedAtRequest) {
      await telegramClient.sendMessage(chat.id, buildCatalogRefreshMessage(), {
        chatType: chat.type,
        ...buildPrivateKeyboardOptions()
      });
      return;
    }

    if (isMiniAppRequest) {
      await sendMiniAppPrompt(chat);
      return;
    }

    if (requestedButton) {
      try {
        await sendCatalogByButton(chat, requestedButton);
      } catch (error) {
        await sendCatalogUnavailable(chat, requestedButton, error);
      }

      return;
    }

    if (!isPrivate) {
      return;
    }

    if (isCategorySectionTap) {
      return;
    }

    try {
      if (await sendCatalogByButton(chat, text)) {
        return;
      }
    } catch (error) {
      await sendCatalogUnavailable(chat, text, error);
      return;
    }

    await telegramClient.sendMessage(chat.id, promptMessage, {
      chatType: chat.type,
      ...buildPrivateKeyboardOptions()
    });
  }

  return {
    handleUpdate,
    sendCatalogByButton
  };
}
