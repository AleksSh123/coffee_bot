import { getCatalogOfferKey } from "../catalog/offer-key.js";
import { createHttpError } from "../lib/http-error.js";
import { buildOrderContext } from "../orders/context.js";

function normalizeNullableString(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized ? normalized : null;
}

function normalizePositiveInteger(value, fieldName) {
  const parsedValue = Number.parseInt(String(value ?? ""), 10);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw createHttpError(400, `${fieldName} must be a positive integer`, "validation_error");
  }

  return parsedValue;
}

function mapUserRow(row) {
  return {
    id: Number(row.id),
    telegramUserId: row.telegram_user_id,
    username: row.username,
    firstName: row.first_name,
    lastName: row.last_name,
    isAdmin: row.is_admin,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
    updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at
  };
}

function mapOrderItemRow(row) {
  const price = Number(row.price_snapshot);
  const quantity = Number(row.quantity);

  return {
    id: Number(row.id),
    productId: row.product_id,
    productName: row.product_name_snapshot,
    categoryId: row.category_id,
    categoryName: row.category_name_snapshot,
    labelName: row.label_name_snapshot,
    offerKey: row.offer_key,
    offerName: row.offer_name_snapshot,
    offerType: row.offer_type_snapshot,
    weight: row.weight_snapshot,
    price,
    quantity,
    lineTotal: Number((price * quantity).toFixed(2)),
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
    updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at
  };
}

function buildOrderTotals(items) {
  return items.reduce(
    (totals, item) => {
      totals.itemsCount += 1;
      totals.totalQuantity += item.quantity;
      totals.totalAmount = Number((totals.totalAmount + item.lineTotal).toFixed(2));
      return totals;
    },
    {
      itemsCount: 0,
      totalQuantity: 0,
      totalAmount: 0
    }
  );
}

function mapOrderRow(row, items, user = null) {
  return {
    id: Number(row.id),
    orderContextKey: row.order_context_key,
    orderContextLabel: row.order_context_label,
    orderContextStatus: row.order_context_status ?? "open",
    lifecycleStatus: row.lifecycle_status,
    paymentStatus: row.payment_status,
    fulfillmentStatus: row.fulfillment_status,
    comment: row.comment,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
    updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at,
    submittedAt: row.submitted_at?.toISOString?.() ?? row.submitted_at,
    paidAt: row.paid_at?.toISOString?.() ?? row.paid_at,
    fulfilledAt: row.fulfilled_at?.toISOString?.() ?? row.fulfilled_at,
    items,
    totals: buildOrderTotals(items),
    user
  };
}

function buildCatalogIndex(snapshot) {
  const itemsById = new Map();

  for (const item of snapshot.items) {
    itemsById.set(String(item.id), item);
  }

  return {
    itemsById,
    categoriesById: snapshot.categoriesById
  };
}

function getCatalogOrderContext(snapshot) {
  return snapshot?.orderContext ?? buildOrderContext(snapshot?.pricesValidText);
}

function findCatalogOffer(item, offerKey) {
  const offers = Array.isArray(item?.offers) ? item.offers : [];
  return offers.find((offer) => getCatalogOfferKey(offer) === offerKey) ?? null;
}

export function createOrderService({ db, catalogService, logger }) {
  async function upsertTelegramUser(identity, executor = db) {
    const { rows } = await executor.query(
      `
        INSERT INTO app_users (
          telegram_user_id,
          username,
          first_name,
          last_name,
          is_admin,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (telegram_user_id)
        DO UPDATE
        SET
          username = EXCLUDED.username,
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          is_admin = EXCLUDED.is_admin,
          updated_at = NOW()
        RETURNING *
      `,
      [
        String(identity.telegramUserId),
        normalizeNullableString(identity.username),
        normalizeNullableString(identity.firstName),
        normalizeNullableString(identity.lastName),
        Boolean(identity.isAdmin)
      ]
    );

    const user = mapUserRow(rows[0]);
    logger.info("miniapp.user.upserted", {
      telegram_user_id: user.telegramUserId,
      is_admin: user.isAdmin
    });
    return user;
  }

  async function ensureTelegramUser(identity, executor = db) {
    const { rows } = await executor.query(
      `
        INSERT INTO app_users (
          telegram_user_id,
          is_admin,
          updated_at
        )
        VALUES ($1, $2, NOW())
        ON CONFLICT (telegram_user_id)
        DO UPDATE
        SET
          is_admin = EXCLUDED.is_admin,
          updated_at = NOW()
        RETURNING *
      `,
      [String(identity.telegramUserId), Boolean(identity.isAdmin)]
    );

    return mapUserRow(rows[0]);
  }

  async function loadOrderById(executor, orderId, userRow = null) {
    const { rows: itemRows } = await executor.query(
      `
        SELECT *
        FROM order_items
        WHERE order_id = $1
        ORDER BY created_at ASC, id ASC
      `,
      [orderId]
    );

    return {
      items: itemRows.map(mapOrderItemRow),
      user: userRow ? mapUserRow(userRow) : null
    };
  }

  async function loadDraftOrder(executor, userId, orderContextKey) {
    const { rows } = await executor.query(
      `
        SELECT *
        FROM orders
        WHERE user_id = $1 AND lifecycle_status = 'draft' AND order_context_key = $2
        ORDER BY id DESC
        LIMIT 1
      `,
      [userId, orderContextKey]
    );

    return rows[0] ?? null;
  }

  async function loadOrderContextStatus(executor, orderContextKey) {
    const { rows } = await executor.query(
      `
        SELECT order_context_status
        FROM orders
        WHERE order_context_key = $1
        ORDER BY updated_at DESC, id DESC
        LIMIT 1
      `,
      [orderContextKey]
    );

    return rows[0]?.order_context_status ?? "open";
  }

  async function ensureDraftOrder(executor, userId, orderContext) {
    const orderContextStatus = await loadOrderContextStatus(executor, orderContext.key);

    await executor.query(
      `
        INSERT INTO orders (user_id, order_context_key, order_context_label, order_context_status)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT DO NOTHING
      `,
      [userId, orderContext.key, orderContext.label, orderContextStatus]
    );

    const draftOrder = await loadDraftOrder(executor, userId, orderContext.key);

    if (!draftOrder) {
      throw createHttpError(500, "Unable to create draft order", "order_draft_create_failed");
    }

    return draftOrder;
  }

  async function getCurrentOrderContext() {
    const catalogSnapshot = await catalogService.getCatalogSnapshot();
    return getCatalogOrderContext(catalogSnapshot);
  }

  async function getDraftOrder(identity) {
    const currentOrderContext = await getCurrentOrderContext();

    return db.transaction(async (executor) => {
      const user = await ensureTelegramUser(identity, executor);
      const orderRow = await loadDraftOrder(executor, user.id, currentOrderContext.key);

      if (!orderRow) {
        return null;
      }

      const orderData = await loadOrderById(executor, orderRow.id);

      return mapOrderRow(orderRow, orderData.items);
    });
  }

  async function addDraftOrderItem(identity, payload) {
    const productId = String(payload.productId ?? "").trim();
    const offerKey = String(payload.offerKey ?? "").trim();
    const quantity = normalizePositiveInteger(payload.quantity, "quantity");

    if (!productId) {
      throw createHttpError(400, "productId is required", "validation_error");
    }

    if (!offerKey) {
      throw createHttpError(400, "offerKey is required", "validation_error");
    }

    const catalogSnapshot = await catalogService.getCatalogSnapshot();
    const orderContext = getCatalogOrderContext(catalogSnapshot);
    const catalogIndex = buildCatalogIndex(catalogSnapshot);
    const item = catalogIndex.itemsById.get(productId);

    if (!item) {
      throw createHttpError(404, "Catalog item was not found", "catalog_item_not_found");
    }

    const offer = findCatalogOffer(item, offerKey);

    if (!offer) {
      throw createHttpError(404, "Catalog offer was not found", "catalog_offer_not_found");
    }

    const category = catalogIndex.categoriesById.get(item.category_id) ?? null;
    const fallbackOfferName = `${offer.weight ?? ""} ${offer.type ?? ""}`.trim();
    const offerName = normalizeNullableString(offer.name) ?? (fallbackOfferName || "Вариант");
    const numericPrice = Number(offer.price);

    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
      throw createHttpError(409, "Catalog offer price is invalid", "catalog_offer_invalid_price");
    }

    return db.transaction(async (executor) => {
      const user = await ensureTelegramUser(identity, executor);
      const orderRow = await ensureDraftOrder(executor, user.id, orderContext);

      await executor.query(
        `
          INSERT INTO order_items (
            order_id,
            product_id,
            product_name_snapshot,
            category_id,
            category_name_snapshot,
            label_name_snapshot,
            offer_key,
            offer_name_snapshot,
            offer_type_snapshot,
            weight_snapshot,
            price_snapshot,
            quantity,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
          ON CONFLICT (order_id, offer_key)
          DO UPDATE
          SET
            product_id = EXCLUDED.product_id,
            product_name_snapshot = EXCLUDED.product_name_snapshot,
            category_id = EXCLUDED.category_id,
            category_name_snapshot = EXCLUDED.category_name_snapshot,
            label_name_snapshot = EXCLUDED.label_name_snapshot,
            offer_name_snapshot = EXCLUDED.offer_name_snapshot,
            offer_type_snapshot = EXCLUDED.offer_type_snapshot,
            weight_snapshot = EXCLUDED.weight_snapshot,
            price_snapshot = EXCLUDED.price_snapshot,
            quantity = EXCLUDED.quantity,
            updated_at = NOW()
        `,
        [
          orderRow.id,
          productId,
          item.name,
          item.category_id !== undefined && item.category_id !== null ? String(item.category_id) : null,
          category?.name ?? null,
          item.label?.name ?? null,
          offerKey,
          offerName,
          offer.type ?? null,
          Number.isFinite(Number(offer.weight)) ? Number(offer.weight) : null,
          numericPrice,
          quantity
        ]
      );

      const freshOrderRow = await loadDraftOrder(executor, user.id, orderContext.key);

      if (!freshOrderRow) {
        throw createHttpError(500, "Draft order was not found after update", "order_draft_missing");
      }

      const orderData = await loadOrderById(executor, freshOrderRow.id);

      return mapOrderRow(freshOrderRow, orderData.items);
    });
  }

  async function updateDraftOrderItem(identity, itemId, payload) {
    const normalizedItemId = normalizePositiveInteger(itemId, "itemId");
    const quantity = normalizePositiveInteger(payload.quantity, "quantity");
    const currentOrderContext = await getCurrentOrderContext();

    return db.transaction(async (executor) => {
      const user = await ensureTelegramUser(identity, executor);
      const orderRow = await loadDraftOrder(executor, user.id, currentOrderContext.key);

      if (!orderRow) {
        throw createHttpError(404, "Draft order was not found", "order_draft_not_found");
      }

      const { rows } = await executor.query(
        `
          UPDATE order_items
          SET quantity = $1, updated_at = NOW()
          WHERE id = $2 AND order_id = $3
          RETURNING id
        `,
        [quantity, normalizedItemId, orderRow.id]
      );

      if (rows.length === 0) {
        throw createHttpError(404, "Order item was not found", "order_item_not_found");
      }

      const orderData = await loadOrderById(executor, orderRow.id);
      return mapOrderRow(orderRow, orderData.items);
    });
  }

  async function removeDraftOrderItem(identity, itemId) {
    const normalizedItemId = normalizePositiveInteger(itemId, "itemId");
    const currentOrderContext = await getCurrentOrderContext();

    return db.transaction(async (executor) => {
      const user = await ensureTelegramUser(identity, executor);
      const orderRow = await loadDraftOrder(executor, user.id, currentOrderContext.key);

      if (!orderRow) {
        throw createHttpError(404, "Draft order was not found", "order_draft_not_found");
      }

      const { rows } = await executor.query(
        `
          DELETE FROM order_items
          WHERE id = $1 AND order_id = $2
          RETURNING id
        `,
        [normalizedItemId, orderRow.id]
      );

      if (rows.length === 0) {
        throw createHttpError(404, "Order item was not found", "order_item_not_found");
      }

      const orderData = await loadOrderById(executor, orderRow.id);
      return mapOrderRow(orderRow, orderData.items);
    });
  }

  async function submitDraftOrder(identity, payload = {}) {
    const comment = normalizeNullableString(payload.comment);
    const currentOrderContext = await getCurrentOrderContext();

    return db.transaction(async (executor) => {
      const user = await ensureTelegramUser(identity, executor);
      const orderRow = await loadDraftOrder(executor, user.id, currentOrderContext.key);

      if (!orderRow) {
        throw createHttpError(404, "Draft order was not found", "order_draft_not_found");
      }

      const orderData = await loadOrderById(executor, orderRow.id);

      if (orderData.items.length === 0) {
        throw createHttpError(
          409,
          "Draft order is empty and cannot be submitted",
          "order_draft_empty"
        );
      }

      const { rows } = await executor.query(
        `
          UPDATE orders
          SET
            lifecycle_status = 'submitted',
            comment = $1,
            submitted_at = NOW(),
            updated_at = NOW()
          WHERE id = $2
          RETURNING *
        `,
        [comment, orderRow.id]
      );

      const submittedOrder = rows[0];

      logger.info("miniapp.order.submitted", {
        order_id: submittedOrder.id,
        telegram_user_id: user.telegramUserId,
        order_context_key: submittedOrder.order_context_key,
        order_context_label: submittedOrder.order_context_label,
        items_count: orderData.items.length
      });

      return mapOrderRow(submittedOrder, orderData.items);
    });
  }

  async function listOwnOrders(identity) {
    const user = await ensureTelegramUser(identity);
    const { rows } = await db.query(
      `
        SELECT *
        FROM orders
        WHERE user_id = $1
        ORDER BY created_at DESC, id DESC
      `,
      [user.id]
    );

    const orders = [];

    for (const row of rows) {
      const orderData = await loadOrderById(db, row.id);
      orders.push(mapOrderRow(row, orderData.items));
    }

    return orders;
  }

  async function getOwnOrder(identity, orderId) {
    const normalizedOrderId = normalizePositiveInteger(orderId, "orderId");
    const user = await ensureTelegramUser(identity);
    const { rows } = await db.query(
      `
        SELECT *
        FROM orders
        WHERE id = $1 AND user_id = $2
        LIMIT 1
      `,
      [normalizedOrderId, user.id]
    );

    if (rows.length === 0) {
      throw createHttpError(404, "Order was not found", "order_not_found");
    }

    const orderData = await loadOrderById(db, rows[0].id);
    return mapOrderRow(rows[0], orderData.items);
  }

  async function listAdminOrders(filters = {}) {
    const whereClauses = [];
    const params = [];

    whereClauses.push(`o.lifecycle_status <> 'draft'`);

    if (filters.orderContextStatus) {
      params.push(filters.orderContextStatus);
      whereClauses.push(`o.order_context_status = $${params.length}`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
    const { rows } = await db.query(
      `
        SELECT
          o.*,
          u.id AS user_id_ref,
          u.telegram_user_id,
          u.username,
          u.first_name,
          u.last_name,
          u.is_admin
        FROM orders o
        INNER JOIN app_users u ON u.id = o.user_id
        ${whereSql}
        ORDER BY o.created_at DESC, o.id DESC
      `,
      params
    );

    const orders = [];

    for (const row of rows) {
      const orderData = await loadOrderById(db, row.id, row);
      orders.push(
        mapOrderRow(row, orderData.items, {
          id: Number(row.user_id_ref),
          telegramUserId: row.telegram_user_id,
          username: row.username,
          firstName: row.first_name,
          lastName: row.last_name,
          isAdmin: row.is_admin
        })
      );
    }

    return orders;
  }

  async function getAdminOrder(orderId) {
    const normalizedOrderId = normalizePositiveInteger(orderId, "orderId");
    const { rows } = await db.query(
      `
        SELECT
          o.*,
          u.id AS user_id_ref,
          u.telegram_user_id,
          u.username,
          u.first_name,
          u.last_name,
          u.is_admin
        FROM orders o
        INNER JOIN app_users u ON u.id = o.user_id
        WHERE o.id = $1
        LIMIT 1
      `,
      [normalizedOrderId]
    );

    if (rows.length === 0) {
      throw createHttpError(404, "Order was not found", "order_not_found");
    }

    const row = rows[0];
    const orderData = await loadOrderById(db, row.id, row);

    return mapOrderRow(row, orderData.items, {
      id: Number(row.user_id_ref),
      telegramUserId: row.telegram_user_id,
      username: row.username,
      firstName: row.first_name,
      lastName: row.last_name,
      isAdmin: row.is_admin
    });
  }

  async function updateAdminOrderStatuses(orderId, payload = {}) {
    const normalizedOrderId = normalizePositiveInteger(orderId, "orderId");
    const paymentStatus = payload.paymentStatus ?? null;
    const fulfillmentStatus = payload.fulfillmentStatus ?? null;

    if (!paymentStatus && !fulfillmentStatus) {
      throw createHttpError(
        400,
        "At least one status field must be provided",
        "validation_error"
      );
    }

    if (paymentStatus && !["unpaid", "paid"].includes(paymentStatus)) {
      throw createHttpError(400, "paymentStatus is invalid", "validation_error");
    }

    if (fulfillmentStatus && !["pending", "fulfilled"].includes(fulfillmentStatus)) {
      throw createHttpError(400, "fulfillmentStatus is invalid", "validation_error");
    }

    return db.transaction(async (executor) => {
      const { rows } = await executor.query(
        `
          SELECT *
          FROM orders
          WHERE id = $1
          LIMIT 1
        `,
        [normalizedOrderId]
      );

      if (rows.length === 0) {
        throw createHttpError(404, "Order was not found", "order_not_found");
      }

      const currentOrder = rows[0];

      if (currentOrder.lifecycle_status !== "submitted") {
        throw createHttpError(
          409,
          "Only submitted orders can be updated by an administrator",
          "order_status_conflict"
        );
      }

      const nextPaymentStatus = paymentStatus ?? currentOrder.payment_status;
      const nextFulfillmentStatus = fulfillmentStatus ?? currentOrder.fulfillment_status;
      const nextPaidAt =
        nextPaymentStatus === "paid"
          ? currentOrder.paid_at ?? new Date()
          : null;
      const nextFulfilledAt =
        nextFulfillmentStatus === "fulfilled"
          ? currentOrder.fulfilled_at ?? new Date()
          : null;

      const { rows: updatedRows } = await executor.query(
        `
          UPDATE orders
          SET
            payment_status = $1,
            fulfillment_status = $2,
            paid_at = $3,
            fulfilled_at = $4,
            updated_at = NOW()
          WHERE id = $5
          RETURNING *
        `,
        [
          nextPaymentStatus,
          nextFulfillmentStatus,
          nextPaidAt,
          nextFulfilledAt,
          normalizedOrderId
        ]
      );

      const orderData = await loadOrderById(executor, normalizedOrderId);
      const updatedOrder = updatedRows[0];

      logger.info("miniapp.order.status.updated", {
        order_id: updatedOrder.id,
        payment_status: updatedOrder.payment_status,
        fulfillment_status: updatedOrder.fulfillment_status
      });

      return mapOrderRow(updatedOrder, orderData.items);
    });
  }

  async function updateAdminOrderContextStatus(orderContextKey, payload = {}) {
    const normalizedOrderContextKey = String(orderContextKey ?? "").trim();
    const nextStatus = String(payload.status ?? "").trim().toLowerCase();

    if (!normalizedOrderContextKey) {
      throw createHttpError(400, "orderContextKey is required", "validation_error");
    }

    if (!["open", "sent", "closed"].includes(nextStatus)) {
      throw createHttpError(400, "status is invalid", "validation_error");
    }

    return db.transaction(async (executor) => {
      const { rows } = await executor.query(
        `
          UPDATE orders
          SET
            order_context_status = $1,
            updated_at = NOW()
          WHERE order_context_key = $2
          RETURNING *
        `,
        [nextStatus, normalizedOrderContextKey]
      );

      if (rows.length === 0) {
        throw createHttpError(404, "Order context was not found", "order_context_not_found");
      }

      logger.info("miniapp.order_context.status.updated", {
        order_context_key: normalizedOrderContextKey,
        order_context_status: nextStatus,
        affected_orders_count: rows.length
      });

      return {
        key: normalizedOrderContextKey,
        label: rows[0].order_context_label,
        status: nextStatus,
        ordersCount: rows.length
      };
    });
  }

  return {
    addDraftOrderItem,
    ensureTelegramUser,
    getAdminOrder,
    getDraftOrder,
    getOwnOrder,
    listAdminOrders,
    listOwnOrders,
    removeDraftOrderItem,
    submitDraftOrder,
    updateAdminOrderContextStatus,
    updateAdminOrderStatuses,
    updateDraftOrderItem,
    upsertTelegramUser
  };
}
