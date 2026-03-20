function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined && entryValue !== null)
  );
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

function logRecord(prefix, record) {
  console.log(`[telegram:${prefix}] ${record.chat_label ?? "unknown"}`);
  console.log(JSON.stringify(record, null, 2));
}

export function createMessageLogger({ enabled }) {
  if (!enabled) {
    return {
      logIncoming() {},
      logOutgoing() {}
    };
  }

  return {
    logIncoming(payload) {
      logRecord("in", buildIncomingRecord(payload));
    },
    logOutgoing(payload) {
      logRecord("out", buildOutgoingRecord(payload));
    }
  };
}
