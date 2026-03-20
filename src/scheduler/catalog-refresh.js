export function createCatalogRefreshScheduler({
  state,
  config,
  catalogService,
  formatError,
  logger
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
          logger.info("catalog.refresh_scheduler.completed", {
            interval_ms: refreshConfig.intervalMs
          });
        } catch (error) {
          logger.error("catalog.refresh_scheduler.failed", {
            error: formatError(error)
          });
        } finally {
          refreshPromise = null;
        }
      })();
    }

    await refreshPromise;
  }

  function start() {
    logger.info("catalog.refresh_scheduler.started", {
      interval_ms: refreshConfig.intervalMs
    });

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
    logger.info("catalog.refresh_scheduler.stopped");
  }

  return {
    start,
    stop
  };
}
