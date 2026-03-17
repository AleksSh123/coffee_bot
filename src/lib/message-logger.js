function formatChatLabel(chatType, chatId) {
  if (chatType) {
    return `${chatType}:${chatId}`;
  }

  return String(chatId);
}

function logMessage(prefix, { chatId, chatType, text }) {
  const messageText = typeof text === "string" ? text : String(text);
  console.log(`[telegram:${prefix}] ${formatChatLabel(chatType, chatId)}\n${messageText}`);
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
      logMessage("in", payload);
    },
    logOutgoing(payload) {
      logMessage("out", payload);
    }
  };
}
