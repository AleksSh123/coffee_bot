export function createPolling({
  state,
  pollTimeout,
  telegramClient,
  handleUpdate,
  formatError,
  logger
}) {
  async function pollUpdates() {
    while (!state.isShuttingDown) {
      try {
        const updates = await telegramClient.getUpdates({
          offset: state.offset,
          timeout: pollTimeout,
          allowedUpdates: ["message"]
        });

        for (const update of updates) {
          state.offset = update.update_id + 1;
          await handleUpdate(update);
        }
      } catch (error) {
        logger.error("telegram.polling.failed", {
          error: formatError(error)
        });
        await new Promise((resolve) => setTimeout(resolve, 3000));
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
