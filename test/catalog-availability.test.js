import assert from "node:assert/strict";
import test from "node:test";

import { filterAvailableCatalogItems } from "../src/catalog/availability.js";
import { createCatalogService } from "../src/services/tasty-catalog.js";
import { createStore } from "../src/state/store.js";

test("excludes unavailable products and offers without changing upstream data", () => {
  const items = [
    { id: 189, name: "Можжевельник", not_available: false, offers: [
      { id: 385, weight: 250, not_available: true, max_quantity: 0 },
      { id: 451, weight: 100, not_available: true, max_quantity: 0 }
    ] },
    { id: 2, offers: [{ id: 3, not_available: true }, { id: 4, not_available: false }] },
    { id: 5, not_available: true, offers: [{ id: 6, not_available: false }] },
    { id: 7, offers: [{ id: 8 }] },
    { id: 9, offers: [] },
    { id: 10 }
  ];
  const original = structuredClone(items);

  assert.deepEqual(filterAvailableCatalogItems(items), [
    { id: 2, offers: [{ id: 4, not_available: false }] },
    { id: 7, offers: [{ id: 8 }] }
  ]);
  assert.deepEqual(items, original);
});

test("shared catalog cache, messages and categories exclude unavailable items", async () => {
  const service = createCatalogService({
    state: createStore(),
    config: { tasty: { apiBaseUrl: "https://example.test", catalogSort: "name-asc" } },
    authService: { hasValidToken: () => true, getAuthorizationHeader: () => "test" },
    logger: { info() {}, error() {} },
    fetchJson: async (url) => ({ data: url.includes("/categories")
      ? [{ id: 25, name: "Чай" }, { id: 26, name: "Кофе" }]
      : [
          { id: 189, name: "Можжевельник", category_id: 25, offers: [
            { id: 385, weight: 250, price: 500, not_available: true }
          ] },
          { id: 2, name: "Доступный кофе", category_id: 26, offers: [
            { id: 3, price: 900, not_available: true },
            { id: 4, price: 1000, not_available: false }
          ] }
        ] })
  });

  const snapshot = await service.getCatalogSnapshot();
  assert.deepEqual(snapshot.items.map((item) => item.id), [2]);
  assert.deepEqual(snapshot.items[0].offers.map((offer) => offer.id), [4]);
  assert.doesNotMatch(snapshot.messages.join("\n"), /Можжевельник|900/);
  assert.match(snapshot.messages.join("\n"), /Доступный кофе/);
  assert.deepEqual(service.getAvailableCategories().map((category) => category.id), ["26"]);
});
