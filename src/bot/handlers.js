import {
  buildCatalogMessagesWithTitle,
  buildPromotionsMessagesWithTitle
} from "../catalog/formatters.js";
import { filterCatalogItems, getCatalogConfigByButton } from "../catalog/filters.js";
import {
  catalogUnavailableMessage,
  promptMessage,
  promotionsButtonLabel,
  promotionsGroupCommand
} from "../config/constants.js";

export function createBotHandlers({ catalogService, telegramClient, formatError, messageLogger }) {
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

  async function sendCatalogByButton(chat, buttonLabel) {
    const config = getCatalogConfigByButton(buttonLabel);

    if (!config) {
      return false;
    }

    const catalog = await catalogService.ensureCatalogReady();
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
        config.labelNames
      );
    } else if (config.labelName || config.labelNames) {
      messages = buildCatalogMessagesWithTitle(
        filteredItems,
        config.headerTitle,
        catalog.categoriesById
      );
    }

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
    if (!update?.message?.chat?.id || !update.message.text) {
      return;
    }

    const { chat, text } = update.message;
    messageLogger.logIncoming({
      chatId: chat.id,
      chatType: chat.type,
      text
    });
    const isPrivate = isPrivateChat(chat);
    const requestedButton = isPrivate
      ? getCatalogConfigByButton(text)?.buttonLabel
      : isGroupPromotionsCommand(text)
        ? promotionsButtonLabel
        : null;

    if (requestedButton) {
      try {
        await sendCatalogByButton(chat, requestedButton);
      } catch (error) {
        console.error(`Catalog send failed: ${formatError(error)}`);
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
