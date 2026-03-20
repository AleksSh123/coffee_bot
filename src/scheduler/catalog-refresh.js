export function createCatalogRefreshScheduler({
  state,
  config,
  catalogService,
  formatError
}) {
  const refreshConfig = config.catalogRefresh;
  let timerId = null;
  let refreshPromise = null;

  async function refreshCatalog() {
    if (state.isShuttingDown) {
      return;
    }

    if (!refreshPromise) {
      refreshPromise = (async () => {
        try {
          await catalogService.ensureCatalogReady(true);
          console.log("Scheduled catalog refresh completed");
        } catch (error) {
          console.error(`Scheduled catalog refresh failed: ${formatError(error)}`);
        } finally {
          refreshPromise = null;
        }
      })();
    }

    await refreshPromise;
  }

  function start() {
    console.log(
      `Scheduled catalog refresh enabled (${refreshConfig.intervalMs} ms interval)`
    );

    timerId = setInterval(() => {
      void refreshCatalog();
    }, refreshConfig.intervalMs);
  }

  function stop() {
    if (!timerId) {
      return;
    }

    clearInterval(timerId);
    timerId = null;
  }

  return {
    start,
    stop
  };
}
