import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

function createApp() {
  const nodes = new Map();
  const shares = [];
  const context = vm.createContext({
    window: {},
    navigator: { share: async (payload) => shares.push(payload) },
    document: {
      querySelector(selector) {
        if (!nodes.has(selector)) {
          nodes.set(selector, { classList: { add() {}, remove() {} }, dataset: {} });
        }
        return nodes.get(selector);
      },
      body: { classList: { add() {}, remove() {} } }
    }
  });
  const source = readFileSync(new URL("../web/miniapp/app.js", import.meta.url), "utf8");
  vm.runInContext(source.replace(/bootstrap\(\);\s*$/, ""), context);
  const order = (id, userId, name, quantity, isActive = true) => ({
    id, user: { id: userId, firstName: name }, isActive, lifecycleStatus: "submitted",
    orderContextKey: "week", orderContextLabel: "Текущий период",
    totals: { totalAmount: quantity * 100 },
    items: [{ offerKey: "tea", productName: "Чай", weight: 250, quantity, lineTotal: quantity * 100 }]
  });
  context.orders = [order(1, 10, "Анна", 2), order(2, 10, "Анна", 3),
    order(3, 20, "Борис", 4), order(4, 30, "Вера", 9, false)];
  vm.runInContext("state.adminOrders = orders", context);
  return { context, nodes, shares, run: (code) => vm.runInContext(code, context) };
}

test("individual export and sharing include only the selected application", async () => {
  const app = createApp();
  app.run('openAdminExportModal("week", "1")');
  const html = app.nodes.get("#admin-export-list").innerHTML;
  assert.match(html, /Анна/);
  assert.doesNotMatch(html, /Борис|Вера/);
  assert.match(html, /2 шт/);
  assert.match(app.nodes.get("#admin-export-title").textContent, /Заявка #1/);
  assert.match(app.nodes.get("#admin-export-total").textContent, /200/);
  await app.run("shareAdminExport()");
  assert.match(app.shares[0].text, /Заявка #1/);
  assert.match(app.shares[0].text, /Чай.*2 шт/);
  assert.doesNotMatch(app.shares[0].text, /Борис|Вера|5 шт/);
});

test("switching back to whole-order export restores all active applications", () => {
  const app = createApp();
  app.run('openAdminExportModal("week", "1"); closeAdminExportModal(); openAdminExportModal("week")');
  const html = app.nodes.get("#admin-export-list").innerHTML;
  assert.match(html, /Анна/);
  assert.match(html, /Борис/);
  assert.match(html, /5 шт/);
  assert.doesNotMatch(html, /Вера/);
  assert.match(app.nodes.get("#admin-export-total").textContent, /900/);
  assert.doesNotMatch(app.nodes.get("#admin-export-title").textContent, /Заявка/);
});

test("a missing selected application never falls back to exporting everyone", () => {
  const app = createApp();
  app.run('openAdminExportModal("week", "missing")');
  assert.equal(app.run("getAdminExportGroup()"), null);
});

test("cancelled applications with legacy active flag are absent from groups and exports", () => {
  const app = createApp();
  app.run('state.adminOrders[0].lifecycleStatus = "cancelled"; openAdminExportModal("week")');
  assert.equal(app.run('getAdminOrderGroup("week").orders.length'), 3);
  assert.equal(app.run('getAdminOrderGroup("week").totalAmount'), 700);
  assert.match(app.nodes.get("#admin-export-total").textContent, /700/);
  assert.doesNotMatch(app.nodes.get("#admin-export-list").innerHTML, /5 шт/);
  assert.equal(app.run('buildAdminExportSummary({ orders: [state.adminOrders[0]] }).positionsCount'), 0);
  app.run('openAdminExportModal("week", "1")');
  assert.equal(app.run("getAdminExportGroup()"), null);
});
