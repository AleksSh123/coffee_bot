import {
  buildCatalogMessagesWithTitle,
  buildPromotionsMessagesWithTitle
} from "../catalog/formatters.js";
import { filterCatalogItems, getCatalogConfigByButton } from "../catalog/filters.js";
import {
  catalogBackButtonLabel,
  catalogCategoriesSectionLabel,
  catalogNotUpdatedYetMessage,
  catalogSupercategoriesSectionLabel,
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
  const categoryNavigationStateByChatId = new Map();

  function hasMiniAppEntry() {
    return Boolean(miniApp?.publicUrl);
  }

  function getNormalizedChatId(chatId) {
    return String(chatId);
  }

  function getCategoryNavigationState(chatId) {
    return categoryNavigationStateByChatId.get(getNormalizedChatId(chatId)) ?? null;
  }

  function setCategoryNavigationState(chatId, categoryId) {
    const normalizedChatId = getNormalizedChatId(chatId);

    if (!categoryId) {
      categoryNavigationStateByChatId.delete(normalizedChatId);
      return;
    }

    categoryNavigationStateByChatId.set(normalizedChatId, String(categoryId));
  }

  function buildCategoryNavigation(chatId) {
    const roots = catalogService.getCategoryTree();
    const currentNode = catalogService.getCategoryNode(getCategoryNavigationState(chatId));

    if (getCategoryNavigationState(chatId) && !currentNode) {
      setCategoryNavigationState(chatId, null);
    }

    return {
      currentNode: currentNode ?? null,
      availableNodes: (currentNode ?? null)?.children ?? roots,
      sectionLabel: currentNode
        ? `Раздел: ${currentNode.pathLabel}`
        : catalogSupercategoriesSectionLabel,
      controlLabels: currentNode ? [catalogBackButtonLabel] : []
    };
  }

  function buildPrivateKeyboardOptions(chatId) {
    return {
      includeKeyboard: true,
      categoryNavigation: (() => {
        const navigation = buildCategoryNavigation(chatId);

        if (navigation.availableNodes.length === 0) {
          return null;
        }

        return {
          sectionLabel: navigation.sectionLabel,
          buttonLabels: navigation.availableNodes.map((categoryNode) => categoryNode.name),
          controlLabels: navigation.controlLabels
        };
      })(),
      includeMiniAppButton: hasMiniAppEntry()
    };
  }

  async function sendMiniAppPrompt(chat) {
    if (!hasMiniAppEntry()) {
      await telegramClient.sendMessage(chat.id, miniAppUnavailableMessage, {
        chatType: chat.type,
        ...buildPrivateKeyboardOptions(chat.id)
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

  function buildCategoryCatalogConfig(categoryNode) {
    return {
      buttonLabel: categoryNode.name,
      headerTitle: categoryNode.pathLabel,
      categoryIds: categoryNode.branchCategoryIds,
      emptyMessage: `Сейчас в каталоге нет позиций в категории «${categoryNode.pathLabel}».`
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
      ...(isPrivateChat(chat) ? buildPrivateKeyboardOptions(chat.id) : {})
    });
  }

  async function sendCatalogByConfig(chat, config, options = {}) {
    const catalog = await catalogService.ensureCatalogReady(Boolean(options.forceRefresh));
    const filteredItems = filterCatalogItems(catalog.items, config);
    const includeKeyboard = isPrivateChat(chat);
    const keyboardOptions = includeKeyboard ? buildPrivateKeyboardOptions(chat.id) : {};

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
      (Array.isArray(config.categoryIds) && config.categoryIds.length > 0) ||
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

  async function sendCatalogByButton(chat, buttonLabel, options = {}) {
    const config = getCatalogConfigByButton(buttonLabel);

    if (!config) {
      return false;
    }

    return sendCatalogByConfig(chat, config, options);
  }

  function findNodeByName(nodes, buttonLabel) {
    return nodes.find((node) => node.name === buttonLabel) ?? null;
  }

  async function handleCategoryNavigation(chat, text) {
    await catalogService.ensureCatalogReady();
    const navigation = buildCategoryNavigation(chat.id);

    if (text === catalogBackButtonLabel) {
      setCategoryNavigationState(chat.id, navigation.currentNode?.parentId ?? null);

      await telegramClient.sendMessage(chat.id, "Выберите категорию.", {
        chatType: chat.type,
        ...buildPrivateKeyboardOptions(chat.id)
      });
      return true;
    }

    const matchedNode =
      findNodeByName(navigation.availableNodes, text) ??
      findNodeByName(catalogService.getCategoryTree(), text) ??
      (() => {
        const uniqueDirectCategories = catalogService
          .getAvailableCategories()
          .filter((categoryNode) => categoryNode.name === text);

        if (uniqueDirectCategories.length !== 1) {
          return null;
        }

        return catalogService.getCategoryNode(uniqueDirectCategories[0].id);
      })();

    if (!matchedNode) {
      return false;
    }

    if (matchedNode.children.length > 0) {
      setCategoryNavigationState(chat.id, matchedNode.id);
      await telegramClient.sendMessage(
        chat.id,
        `Раздел «${matchedNode.pathLabel}». Выберите следующую категорию.`,
        {
          chatType: chat.type,
          ...buildPrivateKeyboardOptions(chat.id)
        }
      );
      return true;
    }

    return sendCatalogByConfig(chat, buildCategoryCatalogConfig(matchedNode));
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
    const isMiniAppRequest = isPrivate && text === miniAppButtonLabel;
    const requestedButton = isPrivate
      ? getCatalogConfigByButton(text)?.buttonLabel
      : isGroupPromotionsCommand(text)
        ? promotionsButtonLabel
        : null;

    if (isCatalogUpdatedAtRequest) {
      await telegramClient.sendMessage(chat.id, buildCatalogRefreshMessage(), {
        chatType: chat.type,
        ...buildPrivateKeyboardOptions(chat.id)
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

    if (
      text === catalogCategoriesSectionLabel ||
      text === catalogSupercategoriesSectionLabel ||
      text === buildCategoryNavigation(chat.id).sectionLabel
    ) {
      return;
    }

    try {
      if (await handleCategoryNavigation(chat, text)) {
        return;
      }
    } catch (error) {
      await sendCatalogUnavailable(chat, text, error);
      return;
    }

    await telegramClient.sendMessage(chat.id, promptMessage, {
      chatType: chat.type,
      ...buildPrivateKeyboardOptions(chat.id)
    });
  }

  return {
    handleUpdate,
    sendCatalogByButton
  };
}
