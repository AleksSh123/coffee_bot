import assert from "node:assert/strict";
import test from "node:test";

import { createOrderService } from "../src/services/order-service.js";

function createFixture(status = "submitted") {
  let order = {
    id: 1, user_id: 10, lifecycle_status: status, is_active: true,
    payment_status: "unpaid", fulfillment_status: "pending"
  };
  const db = {
    async query(sql) {
      if (sql.includes("INSERT INTO app_users")) {
        return { rows: [{ id: 10, telegram_user_id: "123" }] };
      }
      if (sql.includes("FROM order_items")) {
        return { rows: [{ id: 20, price_snapshot: 500, quantity: 2 }] };
      }
      if (sql.includes("UPDATE orders")) {
        assert.match(sql, /lifecycle_status = 'cancelled'/);
        assert.match(sql, /is_active = FALSE/);
        order = { ...order, lifecycle_status: "cancelled", is_active: false };
        return { rows: [order] };
      }
      if (sql.includes("INNER JOIN app_users")) {
        assert.match(sql, /o.lifecycle_status = 'submitted'/);
        return { rows: order.lifecycle_status === "submitted" ? [order] : [] };
      }
      if (sql.includes("FROM orders")) return { rows: [order] };
      throw new Error(`Unexpected query: ${sql}`);
    },
    transaction(callback) { return callback(db); }
  };
  return createOrderService({ db, catalogService: {}, logger: { info() {} } });
}

test("owner deletion deactivates the application and removes it from admin listing", async () => {
  const service = createFixture();
  assert.equal((await service.listAdminOrders()).length, 1);
  const deleted = await service.deleteOwnOrder({ telegramUserId: "123" }, 1);
  assert.equal(deleted.lifecycleStatus, "cancelled");
  assert.equal(deleted.isActive, false);
  assert.equal(deleted.totals.totalAmount, 1000);
  assert.deepEqual(await service.listAdminOrders(), []);
  await assert.rejects(service.setAdminOrderActive(1, true), { code: "order_active_conflict" });
});

test("legacy cancelled applications are reported inactive even before database cleanup", async () => {
  const service = createFixture("cancelled");
  const deleted = await service.deleteOwnOrder({ telegramUserId: "123" }, 1);
  assert.equal(deleted.isActive, false);
  assert.deepEqual(await service.listAdminOrders(), []);
});
