import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

function normalizeRecord(level, event, payload = {}) {
  return {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...payload
  };
}

function formatRecord(record) {
  return `${JSON.stringify(record, null, 2)}\n\n`;
}

export function createAppLogger({ filePath }) {
  let activeFilePath = filePath?.trim() ? filePath.trim() : null;

  if (activeFilePath) {
    mkdirSync(dirname(activeFilePath), { recursive: true });
  }

  function write(level, event, payload) {
    const record = normalizeRecord(level, event, payload);
    const formattedRecord = formatRecord(record);

    if (level === "error") {
      console.error(formattedRecord.trimEnd());
    } else {
      console.log(formattedRecord.trimEnd());
    }

    if (!activeFilePath) {
      return;
    }

    try {
      appendFileSync(activeFilePath, formattedRecord);
    } catch (error) {
      const fallbackRecord = formatRecord(
        normalizeRecord("error", "logger.file_write_failed", {
          file_path: activeFilePath,
          error: error instanceof Error ? error.message : String(error)
        })
      );

      console.error(fallbackRecord.trimEnd());
      activeFilePath = null;
    }
  }

  return {
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
