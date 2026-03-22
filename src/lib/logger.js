import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const logLevelWeights = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};
const defaultLogLevel = "info";
const appLogFallbackModule = "app";
const appLogFallbackEvent = "event";
const appLogFallbackStatus = "-";
const compactInfoDetailsEntryLimit = 4;

function normalizeLogLevel(value) {
  if (typeof value !== "string") {
    return defaultLogLevel;
  }

  const normalized = value.trim().toLowerCase();

  return Object.hasOwn(logLevelWeights, normalized) ? normalized : defaultLogLevel;
}

function normalizeRecord(level, event, payload = {}) {
  return {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...payload
  };
}

function formatJsonRecord(record) {
  return `${JSON.stringify(record, null, 2)}\n\n`;
}

function splitEventDescriptor(eventName) {
  const parts = String(eventName)
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 3) {
    return {
      moduleName: parts.slice(0, -2).join("."),
      event: parts.at(-2),
      status: parts.at(-1)
    };
  }

  if (parts.length === 2) {
    return {
      moduleName: parts[0],
      event: parts[1],
      status: appLogFallbackStatus
    };
  }

  if (parts.length === 1) {
    return {
      moduleName: appLogFallbackModule,
      event: parts[0],
      status: appLogFallbackStatus
    };
  }

  return {
    moduleName: appLogFallbackModule,
    event: appLogFallbackEvent,
    status: appLogFallbackStatus
  };
}

function isScalarValue(value) {
  return (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function formatCompactDetails(details) {
  const entries = Object.entries(details);
  const scalarEntries = entries.filter(([, value]) => isScalarValue(value));
  const visibleEntries = scalarEntries.slice(0, compactInfoDetailsEntryLimit);
  const omittedCount = entries.length - visibleEntries.length;

  if (visibleEntries.length === 0) {
    return omittedCount > 0 ? `omitted=${omittedCount}` : "-";
  }

  const compactDetails = visibleEntries.map(
    ([key, value]) => `${key}=${JSON.stringify(value)}`
  );

  if (omittedCount > 0) {
    compactDetails.push(`omitted=${omittedCount}`);
  }

  return compactDetails.join(" ");
}

function formatFullDetails(details) {
  return Object.keys(details).length > 0 ? JSON.stringify(details) : "-";
}

function formatAppRecord(record, { compactInfoDetails }) {
  const { timestamp, level, event, ...details } = record;
  const descriptor = splitEventDescriptor(event);
  const serializedDetails =
    compactInfoDetails && level === "info"
      ? formatCompactDetails(details)
      : formatFullDetails(details);

  return `${[
    timestamp,
    level.toUpperCase(),
    descriptor.moduleName,
    descriptor.event,
    descriptor.status,
    serializedDetails
  ].join(" ")}\n`;
}

function createAppRecordFormatter(minLevel) {
  const compactInfoDetails = minLevel !== "debug";

  return (record) => formatAppRecord(record, { compactInfoDetails });
}

function shouldWriteRecord(recordLevel, minLevel) {
  return logLevelWeights[recordLevel] >= logLevelWeights[minLevel];
}

export function createLogger({
  filePath,
  level = defaultLogLevel,
  consoleEnabled = true,
  recordFormatter = formatJsonRecord
}) {
  let activeFilePath = filePath?.trim() ? filePath.trim() : null;
  const minLevel = normalizeLogLevel(level);

  if (activeFilePath) {
    mkdirSync(dirname(activeFilePath), { recursive: true });
  }

  function write(recordLevel, event, payload) {
    if (!shouldWriteRecord(recordLevel, minLevel)) {
      return;
    }

    const record = normalizeRecord(recordLevel, event, payload);
    const formattedRecord = recordFormatter(record);

    if (consoleEnabled) {
      if (recordLevel === "error") {
        console.error(formattedRecord.trimEnd());
      } else {
        console.log(formattedRecord.trimEnd());
      }
    }

    if (!activeFilePath) {
      return;
    }

    try {
      appendFileSync(activeFilePath, formattedRecord);
    } catch (error) {
      const fallbackRecord = recordFormatter(
        normalizeRecord("error", "logger.write.failed", {
          file_path: activeFilePath,
          error: error instanceof Error ? error.message : String(error)
        })
      );

      console.error(fallbackRecord.trimEnd());
      activeFilePath = null;
    }
  }

  return {
    debug(event, payload) {
      write("debug", event, payload);
    },
    info(event, payload) {
      write("info", event, payload);
    },
    warn(event, payload) {
      write("warn", event, payload);
    },
    error(event, payload) {
      write("error", event, payload);
    }
  };
}

export function createAppLogger({ filePath, level }) {
  const normalizedLevel = normalizeLogLevel(level);

  return createLogger({
    filePath,
    level: normalizedLevel,
    consoleEnabled: true,
    recordFormatter: createAppRecordFormatter(normalizedLevel)
  });
}

export function createFileLogger({ filePath, level = "info" }) {
  return createLogger({
    filePath,
    level,
    consoleEnabled: false
  });
}
