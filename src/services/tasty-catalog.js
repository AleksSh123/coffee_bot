import { buildCategoryTree } from "../catalog/category-tree.js";
import { buildCatalogMessagesWithTitle } from "../catalog/formatters.js";
import { defaultCatalogTitle } from "../config/constants.js";

function getResponseItems(response) {
  if (Array.isArray(response?.data)) {
    return response.data;
  }

  if (Array.isArray(response?.data?.items)) {
    return response.data.items;
  }

  return null;
}

function extractPricesValidText(response) {
  const candidates = [
    response?.meta?.prices_valid,
    response?.meta?.pricesValid,
    response?.meta?.prices_valid_until,
    response?.meta?.pricesValidUntil,
    response?.meta?.["цены валидны до"]
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

export function createCatalogService({ state, config, authService, fetchJson, logger }) {
  function getAvailableCategories() {
    return [...state.catalog.categoryNodesById.values()]
      .filter((categoryNode) => categoryNode.directItemCount > 0)
      .sort((left, right) => left.pathLabel.localeCompare(right.pathLabel, "ru-RU"));
  }

  function formatRefreshTimestamp(timestamp) {
    return new Intl.DateTimeFormat("ru-RU", {
      timeZone: config.catalogRefresh.timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).format(new Date(timestamp));
  }

  async function fetchCategories() {
    const response = await fetchJson(`${config.tasty.apiBaseUrl}/catalog/categories`, {
      logContext: "tasty.catalog.categories",
      headers: {
        Authorization: authService.getAuthorizationHeader()
      }
    });

    const categories = getResponseItems(response);

    if (!Array.isArray(categories)) {
      throw new Error("Tasty Coffee categories response did not include a category array");
    }

    return {
      categoriesById: new Map(categories.map((category) => [category.id, category])),
      pricesValidText: extractPricesValidText(response)
    };
  }

  async function fetchCatalog() {
    const response = await fetchJson(
      `${config.tasty.apiBaseUrl}/catalog/products?sort=${encodeURIComponent(config.tasty.catalogSort)}`,
      {
        logContext: "tasty.catalog.products",
        headers: {
          Authorization: authService.getAuthorizationHeader()
        }
      }
    );

    const items = getResponseItems(response);

    if (!Array.isArray(items)) {
      throw new Error("Tasty Coffee catalog response did not include a product array");
    }

    return items;
  }

  async function fetchCatalogData() {
    const startedAt = Date.now();
    const [{ categoriesById, pricesValidText }, items] = await Promise.all([
      fetchCategories(),
      fetchCatalog()
    ]);
    const { roots: categoryRoots, nodesById: categoryNodesById } = buildCategoryTree(
      categoriesById,
      items
    );
    const lastRefreshedAt = Date.now();

    state.catalog = {
      items,
      categoriesById,
      categoryRoots,
      categoryNodesById,
      messages: buildCatalogMessagesWithTitle(items, defaultCatalogTitle, categoriesById),
      pricesValidText,
      lastRefreshedAt
    };

    logger.info("catalog.sync.success", {
      items_count: items.length,
      categories_count: categoriesById.size,
      refreshed_at: new Date(lastRefreshedAt).toISOString(),
      duration_ms: lastRefreshedAt - startedAt
    });
  }

  async function refreshCatalogCache(forceLogin) {
    logger.info("catalog.sync.start", {
      force_login: forceLogin,
      has_valid_token: authService.hasValidToken()
    });

    if (forceLogin || !authService.hasValidToken()) {
      await authService.login();
    }

    try {
      await fetchCatalogData();
    } catch (error) {
      if (!forceLogin && error?.status === 401) {
        logger.warn("catalog.sync.retry_after_unauthorized", {
          error_status: error.status
        });
        await authService.login();
        await fetchCatalogData();
        return;
      }

      logger.error("catalog.sync.failed", {
        error: error instanceof Error ? error.message : String(error),
        status: error?.status
      });
      throw error;
    }
  }

  async function ensureCatalogReady(forceRefresh = false) {
    const shouldRefresh =
      forceRefresh ||
      !authService.hasValidToken() ||
      state.catalog.items.length === 0 ||
      state.catalog.messages.length === 0;

    if (!shouldRefresh) {
      return state.catalog;
    }

    if (!state.refreshPromise) {
      state.refreshPromise = (async () => {
        try {
          await refreshCatalogCache(forceRefresh);
          return state.catalog;
        } finally {
          state.refreshPromise = null;
        }
      })();
    }

    return state.refreshPromise;
  }

  return {
    ensureCatalogReady,
    async getCatalogSnapshot(forceRefresh = false) {
      return ensureCatalogReady(forceRefresh);
    },
    getAvailableCategories,
    getCategoryTree() {
      return state.catalog.categoryRoots;
    },
    getCategoryNode(categoryId) {
      const normalizedCategoryId =
        categoryId === undefined || categoryId === null ? null : String(categoryId).trim();

      if (!normalizedCategoryId) {
        return null;
      }

      return state.catalog.categoryNodesById.get(normalizedCategoryId) ?? null;
    },
    getLastRefreshInfo() {
      if (!state.catalog.lastRefreshedAt) {
        return null;
      }

      return {
        timestamp: state.catalog.lastRefreshedAt,
        formatted: formatRefreshTimestamp(state.catalog.lastRefreshedAt),
        timeZone: config.catalogRefresh.timeZone
      };
    }
  };
}
