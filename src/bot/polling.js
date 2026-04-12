export function createPolling({
  state,
  pollTimeout,
  telegramClient,
  handleUpdate,
  formatError,
  logger
}) {
  const transientPollingStatuses = new Set([502, 503, 504]);
  const pollingRetryDelayMs = 3000;
  const transientWarningInterval = 100;
  let consecutiveTransientFailures = 0;

  function isTransientPollingError(error) {
    return (
      error instanceof Error &&
      (error.status === undefined || transientPollingStatuses.has(error.status))
    );
  }

  function wait(delayMs) {
    return new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  async function pollUpdates() {
    while (!state.isShuttingDown) {
      let updates;

      try {
        updates = await telegramClient.getUpdates({
          offset: state.offset,
          timeout: pollTimeout,
          allowedUpdates: ["message"]
        });
      } catch (error) {
        if (isTransientPollingError(error)) {
          consecutiveTransientFailures += 1;

          const logMethod =
            consecutiveTransientFailures === 1 ||
            consecutiveTransientFailures % transientWarningInterval === 0
              ? "warn"
              : "debug";

          logger[logMethod]("telegram.polling.retry_scheduled", {
            attempt: consecutiveTransientFailures,
            retry_in_ms: pollingRetryDelayMs,
            error: formatError(error)
          });
        } else {
          consecutiveTransientFailures = 0;
          logger.error("telegram.polling.failed", {
            error: formatError(error)
          });
        }

        await wait(pollingRetryDelayMs);
        continue;
      }

      if (consecutiveTransientFailures > 0) {
        logger.info("telegram.polling.recovered", {
          failed_attempts: consecutiveTransientFailures
        });
        consecutiveTransientFailures = 0;
      }

      try {
        for (const update of updates) {
          state.offset = update.update_id + 1;
          await handleUpdate(update);
        }
      } catch (error) {
        logger.error("telegram.update.handling.failed", {
          update_id: state.offset - 1,
          error: formatError(error)
        });
        await wait(pollingRetryDelayMs);
      }
    }
  }

  function shutdown(signal) {
    logger.info("app.shutdown.requested", {
      signal
    });
    state.isShuttingDown = true;
  }

  return {
    pollUpdates,
    shutdown
  };
}
