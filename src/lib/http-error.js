export function createHttpError(status, message, code = "http_error", details = null) {
  const error = new Error(message);
  error.status = status;
  error.code = code;

  if (details !== null) {
    error.details = details;
  }

  return error;
}
