export function createPolling({ state, pollTimeout, telegramClient, handleUpdate, formatError }) {
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
        console.error(formatError(error));
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
  }

  function shutdown(signal) {
    console.log(`Received ${signal}, shutting down`);
    state.isShuttingDown = true;
  }

  return {
    pollUpdates,
    shutdown
  };
}
