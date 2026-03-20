const sensitiveKeys = new Set([
  "access_token",
  "authorization",
  "password",
  "token",
  "token_type"
]);
let requestSequence = 0;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sanitizeForLogs(value, depth = 0) {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return value.length > 500 ? `${value.slice(0, 500)}... [truncated ${value.length - 500} chars]` : value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (depth >= 4) {
    return "[MaxDepth]";
  }

  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
      sample: value.slice(0, 3).map((entry) => sanitizeForLogs(entry, depth + 1))
    };
  }

  if (!isPlainObject(value)) {
    return String(value);
  }

  const entries = Object.entries(value);
  const result = {};

  for (const [key, entryValue] of entries.slice(0, 20)) {
    if (sensitiveKeys.has(key.toLowerCase())) {
      result[key] = "[REDACTED]";
      continue;
    }

    result[key] = sanitizeForLogs(entryValue, depth + 1);
  }

  if (entries.length > 20) {
    result._truncated_keys = entries.length - 20;
  }

  return result;
}

function buildRequestLogRecord({ requestId, context, method, url, headers, body }) {
  return {
    request_id: requestId,
    context,
    method,
    url,
    headers: sanitizeForLogs(headers),
    body: sanitizeForLogs(body)
  };
}

function buildResponseLogRecord({
  requestId,
  context,
  method,
  url,
  status,
  durationMs,
  payload
}) {
  return {
    request_id: requestId,
    context,
    method,
    url,
    status,
    duration_ms: durationMs,
    payload: sanitizeForLogs(payload)
  };
}

export async function fetchJson(
  url,
  { method = "GET", headers = {}, body, logger, logContext } = {}
) {
  const requestId = ++requestSequence;
  const startedAt = Date.now();

  logger?.info(
    "http.request",
    buildRequestLogRecord({
      requestId,
      context: logContext,
      method,
      url,
      headers,
      body
    })
  );

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });

    const rawText = await response.text();
    let payload = null;

    if (rawText) {
      try {
        payload = JSON.parse(rawText);
      } catch {
        payload = rawText;
      }
    }

    const responseLogRecord = buildResponseLogRecord({
      requestId,
      context: logContext,
      method,
      url,
      status: response.status,
      durationMs: Date.now() - startedAt,
      payload
    });

    if (!response.ok) {
      logger?.error("http.response", responseLogRecord);
      const details = typeof payload === "string" ? payload : JSON.stringify(payload);
      const error = new Error(`Request failed: ${response.status} ${details}`);
      error.status = response.status;
      throw error;
    }

    logger?.info("http.response", responseLogRecord);
    return payload;
  } catch (error) {
    if (error?.status === undefined) {
      logger?.error("http.error", {
        request_id: requestId,
        context: logContext,
        method,
        url,
        duration_ms: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    throw error;
  }
}
