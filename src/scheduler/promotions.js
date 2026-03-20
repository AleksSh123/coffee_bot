import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { promotionsButtonLabel } from "../config/constants.js";

function loadSchedulerState(stateFilePath) {
  if (!existsSync(stateFilePath)) {
    return {
      lastPublishedSlotKey: null
    };
  }

  try {
    const rawState = readFileSync(stateFilePath, "utf8");
    const parsedState = JSON.parse(rawState);

    return {
      lastPublishedSlotKey: parsedState?.lastPublishedSlotKey ?? null
    };
  } catch {
    return {
      lastPublishedSlotKey: null
    };
  }
}

function saveSchedulerState(stateFilePath, schedulerState) {
  mkdirSync(dirname(stateFilePath), { recursive: true });
  writeFileSync(stateFilePath, JSON.stringify(schedulerState, null, 2));
}

function getCurrentTimeParts(timeZone, date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });

  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number.parseInt(parts.hour, 10),
    minute: Number.parseInt(parts.minute, 10)
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function buildScheduledGreeting(alertUsername) {
  const greetingLine = alertUsername
    ? `\u041f\u0440\u0438\u0432\u0435\u0442\u0441\u0442\u0432\u0443\u044e ${escapeHtml(alertUsername)}!`
    : "\u041f\u0440\u0438\u0432\u0435\u0442!";

  return (
    `${greetingLine}\n` +
    `\u0412\u043e\u0442 \u0441\u043f\u0438\u0441\u043e\u043a ` +
    `\u0430\u043a\u0446\u0438\u043e\u043d\u043d\u044b\u0445 \u0442\u043e\u0432\u0430\u0440\u043e\u0432 ` +
    `\u043d\u0430 \u043d\u043e\u0432\u043e\u0439 \u043d\u0435\u0434\u0435\u043b\u0435.`
  );
}

export function createPromotionsScheduler({
  state,
  config,
  sendCatalogByButton,
  formatError,
  logger
}) {
  const scheduleConfig = config.promotionsSchedule;
  let timerId = null;
  let publishPromise = null;
  let schedulerState = loadSchedulerState(scheduleConfig.stateFilePath);

  function isEnabled() {
    return scheduleConfig.enabled;
  }

  function getSlotKey(date = new Date()) {
    const currentTime = getCurrentTimeParts(scheduleConfig.timeZone, date);
    return `${currentTime.dateKey}@${scheduleConfig.timeLabel}`;
  }

  function isScheduledMinute(date = new Date()) {
    const currentTime = getCurrentTimeParts(scheduleConfig.timeZone, date);

    return (
      currentTime.hour === scheduleConfig.hour &&
      currentTime.minute === scheduleConfig.minute
    );
  }

  function wasPublished(slotKey) {
    return schedulerState.lastPublishedSlotKey === slotKey;
  }

  function markPublished(slotKey) {
    schedulerState = {
      lastPublishedSlotKey: slotKey
    };
    saveSchedulerState(scheduleConfig.stateFilePath, schedulerState);
  }

  async function publishIfDue(date = new Date()) {
    if (!isEnabled() || state.isShuttingDown || !isScheduledMinute(date)) {
      return;
    }

    const slotKey = getSlotKey(date);

    if (wasPublished(slotKey)) {
      return;
    }

    if (!publishPromise) {
      publishPromise = (async () => {
        try {
          const wasSent = await sendCatalogByButton(
            {
              id: scheduleConfig.channelId,
              type: "channel"
            },
            promotionsButtonLabel,
            {
              forceRefresh: true,
              messagePrefix: buildScheduledGreeting(scheduleConfig.alertUsername)
            }
          );

          if (!wasSent) {
            throw new Error("Promotions button configuration is not available");
          }

          markPublished(slotKey);
          logger.info("promotions.scheduler.published", {
            channel_id: scheduleConfig.channelId,
            slot_key: slotKey
          });
        } catch (error) {
          logger.error("promotions.scheduler.failed", {
            channel_id: scheduleConfig.channelId,
            slot_key: slotKey,
            error: formatError(error)
          });
        } finally {
          publishPromise = null;
        }
      })();
    }

    await publishPromise;
  }

  function start() {
    if (!isEnabled()) {
      logger.info("promotions.scheduler.disabled");
      return;
    }

    logger.info("promotions.scheduler.started", {
      channel_id: scheduleConfig.channelId,
      time_label: scheduleConfig.timeLabel,
      time_zone: scheduleConfig.timeZone,
      check_interval_ms: scheduleConfig.checkIntervalMs
    });

    timerId = setInterval(() => {
      void publishIfDue();
    }, scheduleConfig.checkIntervalMs);

    void publishIfDue();
  }

  function stop() {
    if (!timerId) {
      return;
    }

    clearInterval(timerId);
    timerId = null;
    logger.info("promotions.scheduler.stopped");
  }

  return {
    start,
    stop
  };
}
