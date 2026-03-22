function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined && entryValue !== null)
  );
}

function normalizeLogLevel(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "debug";
}

function isGroupChat(chat) {
  return ["group", "supergroup"].includes(chat?.type);
}

function formatUnixTimestamp(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return undefined;
  }

  return new Date(numericValue * 1000).toISOString();
}

function extractMessageText(message) {
  if (!message) {
    return undefined;
  }

  if (typeof message.text === "string" && message.text.trim()) {
    return message.text;
  }

  if (typeof message.caption === "string" && message.caption.trim()) {
    return message.caption;
  }

  return undefined;
}

function formatPersonLabel(user) {
  if (!user) {
    return undefined;
  }

  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();

  if (fullName && user.username) {
    return `${fullName} (@${user.username})`;
  }

  if (fullName) {
    return fullName;
  }

  if (user.username) {
    return `@${user.username}`;
  }

  if (user.id !== undefined && user.id !== null) {
    return String(user.id);
  }

  return undefined;
}

function formatGroupLabel(chat) {
  if (!isGroupChat(chat)) {
    return undefined;
  }

  if (chat.title) {
    return chat.title;
  }

  if (chat.username) {
    return `@${chat.username}`;
  }

  if (chat.id !== undefined && chat.id !== null) {
    return String(chat.id);
  }

  return undefined;
}

function pickUser(user) {
  if (!user) {
    return undefined;
  }

  return compactObject({
    id: user.id,
    is_bot: user.is_bot,
    username: user.username,
    first_name: user.first_name,
    last_name: user.last_name,
    language_code: user.language_code
  });
}

function pickChat(chat) {
  if (!chat) {
    return undefined;
  }

  return compactObject({
    id: chat.id,
    type: chat.type,
    title: chat.title,
    username: chat.username,
    first_name: chat.first_name,
    last_name: chat.last_name
  });
}

function pickMessage(message) {
  if (!message) {
    return undefined;
  }

  return compactObject({
    message_id: message.message_id,
    message_thread_id: message.message_thread_id,
    date: message.date,
    edit_date: message.edit_date,
    text: message.text,
    caption: message.caption,
    entities: message.entities,
    caption_entities: message.caption_entities,
    chat: pickChat(message.chat),
    from: pickUser(message.from),
    sender_chat: pickChat(message.sender_chat),
    via_bot: pickUser(message.via_bot),
    reply_to_message_id: message.reply_to_message?.message_id
  });
}

function formatChatLabel(chat) {
  const chatId = chat?.id ?? "unknown";
  const chatType = chat?.type;

  if (chatType) {
    return `${chatType}:${chatId}`;
  }

  return String(chatId);
}

function buildIncomingRecord(payload) {
  const message = payload.message;

  return compactObject({
    update_id: payload.updateId,
    chat_label: formatChatLabel(message?.chat),
    message: pickMessage(message)
  });
}

function buildIncomingSummary(payload) {
  const message = payload.message;

  return compactObject({
    direction: "in",
    message_date: formatUnixTimestamp(message?.date),
    text: extractMessageText(message),
    from: formatPersonLabel(message?.from),
    group: formatGroupLabel(message?.chat)
  });
}

function buildOutgoingRecord(payload) {
  const request = payload.request ?? {};
  const responseMessage = payload.responseMessage;
  const responseChat = responseMessage?.chat;

  return compactObject({
    chat_label: formatChatLabel(responseChat ?? { id: request.chat_id, type: payload.chatType }),
    request: compactObject({
      chat_id: request.chat_id,
      text: request.text,
      parse_mode: request.parse_mode,
      has_reply_markup: request.reply_markup !== undefined
    }),
    response_message: pickMessage(responseMessage)
  });
}

function buildOutgoingSummary(payload) {
  const request = payload.request ?? {};
  const responseMessage = payload.responseMessage;
  const chat = responseMessage?.chat ?? { id: request.chat_id, type: payload.chatType };

  return compactObject({
    direction: "out",
    message_date: formatUnixTimestamp(responseMessage?.date),
    text: extractMessageText(responseMessage) ?? request.text,
    from: formatPersonLabel(responseMessage?.from),
    group: formatGroupLabel(chat)
  });
}

export function createMessageLogger({ enabled, level = "debug", logger }) {
  if (!enabled || !logger?.info || !logger?.debug) {
    return {
      logIncoming() {},
      logOutgoing() {}
    };
  }

  const normalizedLevel = normalizeLogLevel(level);
  const useDetailedRecords = normalizedLevel === "debug";

  return {
    logIncoming(payload) {
      if (useDetailedRecords) {
        logger.debug("telegram.message.in", buildIncomingRecord(payload));
        return;
      }

      logger.info("telegram.message.in", buildIncomingSummary(payload));
    },
    logOutgoing(payload) {
      if (useDetailedRecords) {
        logger.debug("telegram.message.out", buildOutgoingRecord(payload));
        return;
      }

      logger.info("telegram.message.out", buildOutgoingSummary(payload));
    }
  };
}
