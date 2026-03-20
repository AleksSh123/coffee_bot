export function createStore() {
  return {
    offset: 0,
    isShuttingDown: false,
    auth: {
      accessToken: null,
      tokenType: "Bearer",
      expiresAt: 0
    },
    catalog: {
      items: [],
      messages: [],
      categoriesById: new Map(),
      lastRefreshedAt: 0
    },
    refreshPromise: null
  };
}
