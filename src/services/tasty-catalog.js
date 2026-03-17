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

export function createCatalogService({ state, config, authService, fetchJson }) {
  async function fetchCategories() {
    const response = await fetchJson(`${config.tasty.apiBaseUrl}/catalog/categories`, {
      headers: {
        Authorization: authService.getAuthorizationHeader()
      }
    });

    const categories = getResponseItems(response);

    if (!Array.isArray(categories)) {
      throw new Error("Tasty Coffee categories response did not include a category array");
    }

    return new Map(categories.map((category) => [category.id, category]));
  }

  async function fetchCatalog() {
    const response = await fetchJson(
      `${config.tasty.apiBaseUrl}/catalog/products?sort=${encodeURIComponent(config.tasty.catalogSort)}`,
      {
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
    const [categoriesById, items] = await Promise.all([fetchCategories(), fetchCatalog()]);

    state.catalog = {
      items,
      categoriesById,
      messages: buildCatalogMessagesWithTitle(items, defaultCatalogTitle, categoriesById)
    };

    console.log(
      `Tasty Coffee catalog loaded: ${items.length} items, ${categoriesById.size} categories`
    );
  }

  async function refreshCatalogCache(forceLogin) {
    if (forceLogin || !authService.hasValidToken()) {
      await authService.login();
    }

    try {
      await fetchCatalogData();
    } catch (error) {
      if (!forceLogin && error?.status === 401) {
        await authService.login();
        await fetchCatalogData();
        return;
      }

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
    ensureCatalogReady
  };
}
