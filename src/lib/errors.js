function formatErrorCode(error) {
  return typeof error?.code === "string" && error.code.length > 0 ? error.code : null;
}

function formatCause(cause) {
  if (!cause) {
    return null;
  }

  if (cause instanceof Error) {
    const causeCode = formatErrorCode(cause);
    const causeMessage = cause.message || cause.name;

    if (!causeMessage) {
      return causeCode;
    }

    return causeCode && !causeMessage.includes(causeCode)
      ? `${causeCode}: ${causeMessage}`
      : causeMessage;
  }

  if (typeof cause === "object") {
    const causeCode = formatErrorCode(cause);
    const causeMessage =
      typeof cause.message === "string" && cause.message.length > 0 ? cause.message : null;

    if (causeCode && causeMessage) {
      return `${causeCode}: ${causeMessage}`;
    }

    if (causeMessage) {
      return causeMessage;
    }

    return JSON.stringify(cause);
  }

  return String(cause);
}

export function formatError(error) {
  if (error instanceof Error) {
    const errorCode = formatErrorCode(error);
    const baseMessage = error.message || error.name || "Unknown error";
    const formattedMessage =
      errorCode && !baseMessage.includes(errorCode) ? `${errorCode}: ${baseMessage}` : baseMessage;
    const formattedCause = formatCause(error.cause);

    return formattedCause && formattedCause !== formattedMessage
      ? `${formattedMessage} (cause: ${formattedCause})`
      : formattedMessage;
  }

  return String(error);
}
