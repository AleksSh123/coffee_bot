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
      categoryRoots: [],
      categoryNodesById: new Map(),
      orderContext: null,
      pricesValidText: null,
      lastRefreshedAt: 0
    },
    refreshPromise: null
  };
}
