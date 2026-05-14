const nestedErrorLimit = 4;

function formatErrorCode(error) {
  return typeof error?.code === "string" && error.code.length > 0 ? error.code : null;
}

function hasObjectShape(value) {
  return value !== null && typeof value === "object";
}

function formatMessageWithCode({ code, message, fallback }) {
  const baseMessage = message || fallback;

  if (!baseMessage) {
    return code;
  }

  return code && !baseMessage.includes(code) ? `${code}: ${baseMessage}` : baseMessage;
}

function formatObjectErrorLike(error) {
  const code = formatErrorCode(error);
  const message = typeof error.message === "string" && error.message.length > 0 ? error.message : null;

  if (message || code) {
    return formatMessageWithCode({
      code,
      message,
      fallback: typeof error.name === "string" && error.name.length > 0 ? error.name : null
    });
  }

  return JSON.stringify(error);
}

function formatNestedErrors(errors, seen) {
  if (!Array.isArray(errors) || errors.length === 0) {
    return null;
  }

  const visibleErrors = errors.slice(0, nestedErrorLimit).map((entry) =>
    formatErrorInternal(entry, seen)
  );
  const omittedCount = errors.length - visibleErrors.length;

  if (omittedCount > 0) {
    visibleErrors.push(`... ${omittedCount} more`);
  }

  return visibleErrors.join("; ");
}

function formatErrorInternal(error, seen = new WeakSet()) {
  if (error instanceof Error) {
    if (seen.has(error)) {
      return "[CircularError]";
    }

    seen.add(error);

    const formattedMessage = formatMessageWithCode({
      code: formatErrorCode(error),
      message: error.message,
      fallback: error.name || "Unknown error"
    });
    const details = [];
    const nestedErrors = formatNestedErrors(error.errors, seen);
    const formattedCause = formatCause(error.cause, seen);

    if (nestedErrors) {
      details.push(`errors: ${nestedErrors}`);
    }

    if (formattedCause && formattedCause !== formattedMessage) {
      details.push(`cause: ${formattedCause}`);
    }

    return details.length > 0 ? `${formattedMessage} (${details.join("; ")})` : formattedMessage;
  }

  if (hasObjectShape(error)) {
    return formatObjectErrorLike(error);
  }

  return String(error);
}

function formatCause(cause, seen) {
  if (cause === null || cause === undefined) {
    return null;
  }

  return formatErrorInternal(cause, seen);
}

export function formatError(error) {
  if (error instanceof Error) {
    return formatErrorInternal(error);
  }

  return String(error);
}
