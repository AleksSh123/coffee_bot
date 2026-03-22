const state = {
  activeTab: "catalog",
  adminFilters: {
    lifecycleStatus: null,
    paymentStatus: null,
    fulfillmentStatus: null
  },
  authToken: null,
  catalog: null,
  categoryFilter: null,
  draftOrder: null,
  isBusy: false,
  isTelegramContext: false,
  orders: [],
  adminOrders: [],
  user: null
};

const elements = {
  adminFilters: document.querySelector("#admin-filters"),
  adminOrdersList: document.querySelector("#admin-orders-list"),
  adminPanel: document.querySelector("#admin-panel"),
  adminRefreshButton: document.querySelector("#admin-refresh-button"),
  catalogList: document.querySelector("#catalog-list"),
  catalogPanel: document.querySelector("#catalog-panel"),
  categoryFilters: document.querySelector("#category-filters"),
  draftComment: document.querySelector("#draft-comment"),
  draftList: document.querySelector("#draft-list"),
  draftPanel: document.querySelector("#draft-panel"),
  draftTotal: document.querySelector("#draft-total"),
  ordersList: document.querySelector("#orders-list"),
  ordersPanel: document.querySelector("#orders-panel"),
  refreshButton: document.querySelector("#refresh-button"),
  statusBanner: document.querySelector("#status-banner"),
  submitOrderButton: document.querySelector("#submit-order-button"),
  tabs: document.querySelector("#tabs"),
  userSummary: document.querySelector("#user-summary")
};

const telegramWebApp = window.Telegram?.WebApp ?? null;
const apiBasePath = "";

function setStatus(message, tone = "neutral") {
  elements.statusBanner.textContent = message;
  elements.statusBanner.dataset.tone = tone;
}

function formatPrice(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return "цена не указана";
  }

  return `${numericValue.toLocaleString("ru-RU", {
    maximumFractionDigits: 2
  })} ₽`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function getDisplayName(user) {
  const parts = [user.firstName, user.lastName].filter(Boolean);
  const fullName = parts.join(" ").trim();

  if (fullName) {
    return user.username ? `${fullName} (@${user.username})` : fullName;
  }

  return user.username ? `@${user.username}` : `Telegram ID ${user.telegramUserId}`;
}

function getOrderItemByOfferKey(offerKey) {
  return state.draftOrder?.items?.find((item) => item.offerKey === offerKey) ?? null;
}

function renderUserSummary() {
  if (!state.user) {
    elements.userSummary.innerHTML = "";
    return;
  }

  const chips = [
    `<span class="hero__meta-chip">${escapeHtml(getDisplayName(state.user))}</span>`,
    `<span class="hero__meta-chip">${state.user.isAdmin ? "Роль: админ" : "Роль: пользователь"}</span>`
  ];

  if (state.catalog?.pricesValidText) {
    chips.push(
      `<span class="hero__meta-chip">${escapeHtml(state.catalog.pricesValidText)}</span>`
    );
  }

  elements.userSummary.innerHTML = chips.join("");
}

function buildTabs() {
  const tabs = [
    { id: "catalog", label: "Каталог" },
    { id: "draft", label: "Черновик" },
    { id: "orders", label: "Мои заявки" }
  ];

  if (state.user?.isAdmin) {
    tabs.push({ id: "admin", label: "Админ" });
  }

  return tabs;
}

function renderTabs() {
  elements.tabs.innerHTML = buildTabs()
    .map(
      (tab) =>
        `<button class="tab-button ${state.activeTab === tab.id ? "is-active" : ""}" type="button" data-tab-id="${tab.id}">${escapeHtml(tab.label)}</button>`
    )
    .join("");
}

function setActiveTab(nextTabId) {
  state.activeTab = nextTabId;
  renderTabs();
  elements.catalogPanel.classList.toggle("is-hidden", nextTabId !== "catalog");
  elements.draftPanel.classList.toggle("is-hidden", nextTabId !== "draft");
  elements.ordersPanel.classList.toggle("is-hidden", nextTabId !== "orders");
  elements.adminPanel.classList.toggle("is-hidden", nextTabId !== "admin");
}

function renderCategoryFilters() {
  const buttons = [
    {
      id: null,
      label: "Все категории"
    },
    ...(state.catalog?.categories ?? [])
  ];

  elements.categoryFilters.innerHTML = buttons
    .map((category) => {
      const id = category.id ?? "";
      const isActive = (category.id ?? null) === state.categoryFilter;
      return `<button class="filter-chip ${isActive ? "is-active" : ""}" type="button" data-category-id="${escapeHtml(id)}">${escapeHtml(category.label ?? category.name)}</button>`;
    })
    .join("");
}

function buildOfferQuantityControl(offerKey, quantity) {
  return `
    <div class="qty-control" data-offer-key="${escapeHtml(offerKey)}">
      <button class="qty-button" type="button" data-action="decrease-offer-qty">-</button>
      <input class="qty-input" type="number" min="1" step="1" value="${quantity}" data-action="offer-qty-input" />
      <button class="qty-button" type="button" data-action="increase-offer-qty">+</button>
    </div>
  `;
}

function renderCatalog() {
  if (!state.catalog) {
    elements.catalogList.innerHTML = '<div class="empty-state">Каталог ещё не загружен.</div>';
    return;
  }

  const filteredItems = state.catalog.items.filter((item) => {
    if (!state.categoryFilter) {
      return true;
    }

    return item.categoryId === state.categoryFilter;
  });

  if (filteredItems.length === 0) {
    elements.catalogList.innerHTML =
      '<div class="empty-state">В выбранной категории нет доступных позиций.</div>';
    return;
  }

  elements.catalogList.innerHTML = filteredItems
    .map((item) => {
      const offerRows = item.offers
        .map((offer) => {
          const existingOrderItem = getOrderItemByOfferKey(offer.offerKey);
          const quantity = existingOrderItem?.quantity ?? 1;

          return `
            <div class="offer-row">
              <div class="offer-row__meta">
                <div class="offer-row__title">${escapeHtml(offer.name ?? "Вариант")}</div>
                <div class="card-subtitle">${escapeHtml(
                  [offer.weight ? `${offer.weight} г` : null, offer.type].filter(Boolean).join(" · ") || "Без описания"
                )}</div>
                <div class="offer-row__price">${escapeHtml(formatPrice(offer.price))}</div>
              </div>
              <div class="offer-row__actions">
                ${buildOfferQuantityControl(offer.offerKey, quantity)}
                <button
                  class="secondary-button"
                  type="button"
                  data-action="save-offer"
                  data-product-id="${escapeHtml(item.id)}"
                  data-offer-key="${escapeHtml(offer.offerKey)}"
                >
                  ${existingOrderItem ? "Обновить" : "В заявку"}
                </button>
              </div>
            </div>
          `;
        })
        .join("");

      return `
        <article class="catalog-card">
          <div class="catalog-card__header">
            <div>
              <h3 class="catalog-card__title">${escapeHtml(item.name)}</h3>
              <div class="card-subtitle">
                ${escapeHtml(
                  [item.categoryName, item.labelName].filter(Boolean).join(" · ") || "Без категории"
                )}
              </div>
            </div>
          </div>
          <div class="offer-list">${offerRows}</div>
        </article>
      `;
    })
    .join("");
}

function renderDraft() {
  const draftOrder = state.draftOrder;

  if (!draftOrder || draftOrder.items.length === 0) {
    elements.draftList.innerHTML =
      '<div class="empty-state">Заявка пока пустая. Добавьте позиции из каталога.</div>';
    elements.draftTotal.textContent = "0 позиций";
    return;
  }

  elements.draftList.innerHTML = draftOrder.items
    .map(
      (item) => `
        <article class="draft-card">
          <div class="draft-card__header">
            <div>
              <h3 class="draft-card__title">${escapeHtml(item.productName)}</h3>
              <div class="card-subtitle">${escapeHtml(
                [item.categoryName, item.offerName].filter(Boolean).join(" · ")
              )}</div>
            </div>
            <div class="history-card__total">${escapeHtml(formatPrice(item.lineTotal))}</div>
          </div>
          <div class="order-item-list">
            <div class="order-item-row">
              <div>
                <div class="order-item-row__title">${escapeHtml(formatPrice(item.price))} за единицу</div>
                <div class="card-subtitle">Количество: ${item.quantity}</div>
              </div>
              <div class="order-item-row__actions">
                <div class="qty-control" data-order-item-id="${item.id}">
                  <button class="qty-button" type="button" data-action="decrease-order-item-qty">-</button>
                  <input class="qty-input" type="number" min="1" step="1" value="${item.quantity}" data-action="order-item-qty-input" />
                  <button class="qty-button" type="button" data-action="increase-order-item-qty">+</button>
                </div>
                <button class="secondary-button" type="button" data-action="save-order-item" data-order-item-id="${item.id}">Сохранить</button>
                <button class="ghost-button" type="button" data-action="remove-order-item" data-order-item-id="${item.id}">Удалить</button>
              </div>
            </div>
          </div>
        </article>
      `
    )
    .join("");

  elements.draftTotal.textContent = `${draftOrder.totals.totalQuantity} шт. · ${formatPrice(
    draftOrder.totals.totalAmount
  )}`;
}

function renderOrders() {
  const submittedOrders = state.orders.filter((order) => order.lifecycleStatus !== "draft");

  if (submittedOrders.length === 0) {
    elements.ordersList.innerHTML =
      '<div class="empty-state">Пока нет отправленных заявок. Соберите первую в каталоге.</div>';
    return;
  }

  elements.ordersList.innerHTML = submittedOrders
    .map(
      (order) => `
        <article class="history-card">
          <div class="history-card__header">
            <div>
              <h3 class="history-card__title">Заявка #${order.id}</h3>
              <div class="card-subtitle">${escapeHtml(
                order.submittedAt ?? order.createdAt ?? "время не указано"
              )}</div>
            </div>
            <div class="history-card__total">${escapeHtml(formatPrice(order.totals.totalAmount))}</div>
          </div>
          <div class="history-meta">
            <span class="status-chip status-chip--${escapeHtml(order.lifecycleStatus)}">${escapeHtml(
              order.lifecycleStatus
            )}</span>
            <span class="status-chip status-chip--${escapeHtml(order.paymentStatus)}">${escapeHtml(
              order.paymentStatus
            )}</span>
            <span class="status-chip status-chip--${escapeHtml(order.fulfillmentStatus)}">${escapeHtml(
              order.fulfillmentStatus
            )}</span>
          </div>
          <div class="inline-note">
            ${order.items
              .map((item) => `${escapeHtml(item.productName)} × ${item.quantity}`)
              .join("<br />")}
          </div>
        </article>
      `
    )
    .join("");
}

function renderAdminFilters() {
  const options = [
    { key: "lifecycleStatus", value: null, label: "Все" },
    { key: "lifecycleStatus", value: "submitted", label: "Только submitted" },
    { key: "paymentStatus", value: "unpaid", label: "Не оплачены" },
    { key: "fulfillmentStatus", value: "pending", label: "Не исполнены" }
  ];

  elements.adminFilters.innerHTML = options
    .map((option) => {
      const isActive = state.adminFilters[option.key] === option.value;
      return `<button class="filter-chip ${isActive ? "is-active" : ""}" type="button" data-admin-filter-key="${option.key}" data-admin-filter-value="${option.value ?? ""}">${escapeHtml(option.label)}</button>`;
    })
    .join("");
}

function buildAdminActionButton(order, field, activeValue, nextValue, label) {
  const currentValue = order[field];
  const isDisabled = order.lifecycleStatus !== "submitted" || currentValue === nextValue;

  return `<button class="${activeValue === currentValue ? "primary-button" : "secondary-button"}" type="button" data-action="admin-update-status" data-order-id="${order.id}" data-status-field="${field}" data-status-value="${nextValue}" ${isDisabled ? "disabled" : ""}>${escapeHtml(label)}</button>`;
}

function renderAdminOrders() {
  if (!state.user?.isAdmin) {
    elements.adminOrdersList.innerHTML = "";
    return;
  }

  if (state.adminOrders.length === 0) {
    elements.adminOrdersList.innerHTML =
      '<div class="empty-state">По выбранным фильтрам заявок нет.</div>';
    return;
  }

  elements.adminOrdersList.innerHTML = state.adminOrders
    .map(
      (order) => `
        <article class="admin-card">
          <div class="admin-card__header">
            <div>
              <h3 class="admin-card__title">Заявка #${order.id}</h3>
              <div class="card-subtitle">${escapeHtml(order.user ? getDisplayName(order.user) : "Пользователь неизвестен")}</div>
            </div>
            <div class="admin-card__total">${escapeHtml(formatPrice(order.totals.totalAmount))}</div>
          </div>
          <div class="admin-meta">
            <span class="status-chip status-chip--${escapeHtml(order.lifecycleStatus)}">${escapeHtml(order.lifecycleStatus)}</span>
            <span class="status-chip status-chip--${escapeHtml(order.paymentStatus)}">${escapeHtml(order.paymentStatus)}</span>
            <span class="status-chip status-chip--${escapeHtml(order.fulfillmentStatus)}">${escapeHtml(order.fulfillmentStatus)}</span>
          </div>
          <div class="admin-order-items inline-note">
            ${order.items.map((item) => `${escapeHtml(item.productName)} · ${escapeHtml(item.offerName)} × ${item.quantity}`).join("<br />")}
          </div>
          <div class="admin-actions">
            <div class="admin-actions__row">
              ${buildAdminActionButton(order, "paymentStatus", "paid", "paid", "Отметить как оплаченный")}
              ${buildAdminActionButton(order, "paymentStatus", "unpaid", "unpaid", "Вернуть в unpaid")}
            </div>
            <div class="admin-actions__row">
              ${buildAdminActionButton(order, "fulfillmentStatus", "fulfilled", "fulfilled", "Отметить как исполненный")}
              ${buildAdminActionButton(order, "fulfillmentStatus", "pending", "pending", "Вернуть в pending")}
            </div>
          </div>
        </article>
      `
    )
    .join("");
}

function renderAll() {
  renderUserSummary();
  renderTabs();
  renderCategoryFilters();
  renderCatalog();
  renderDraft();
  renderOrders();
  renderAdminFilters();
  renderAdminOrders();
  setActiveTab(state.activeTab);
}

async function apiRequest(path, options = {}) {
  const response = await fetch(apiBasePath + path, {
    method: options.method ?? "GET",
    headers: {
      ...(state.authToken ? { Authorization: `Bearer ${state.authToken}` } : {}),
      ...(options.body ? { "Content-Type": "application/json" } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
  }

  return payload;
}

async function refreshCatalog() {
  const catalogPayload = await apiRequest("/api/catalog");
  state.catalog = catalogPayload;
}

async function refreshDraftOrder() {
  const payload = await apiRequest("/api/me/order");
  state.draftOrder = payload.order;
}

async function refreshOwnOrders() {
  const payload = await apiRequest("/api/me/orders");
  state.orders = payload.orders;
}

async function refreshAdminOrders() {
  if (!state.user?.isAdmin) {
    return;
  }

  const params = new URLSearchParams();

  if (state.adminFilters.lifecycleStatus) {
    params.set("lifecycle_status", state.adminFilters.lifecycleStatus);
  }

  if (state.adminFilters.paymentStatus) {
    params.set("payment_status", state.adminFilters.paymentStatus);
  }

  if (state.adminFilters.fulfillmentStatus) {
    params.set("fulfillment_status", state.adminFilters.fulfillmentStatus);
  }

  const path = `/api/admin/orders${params.toString() ? `?${params.toString()}` : ""}`;
  const payload = await apiRequest(path);
  state.adminOrders = payload.orders;
}

async function refreshAllData() {
  await Promise.all([refreshCatalog(), refreshDraftOrder(), refreshOwnOrders(), refreshAdminOrders()]);
  renderAll();
}

function resolveTelegramInitData() {
  const initData = telegramWebApp?.initData ?? "";
  return typeof initData === "string" ? initData.trim() : "";
}

async function authenticate() {
  const initData = resolveTelegramInitData();

  if (!initData) {
    state.isTelegramContext = false;
    setStatus("Откройте mini app внутри Telegram, чтобы подтвердить личность.", "warning");
    renderAll();
    return false;
  }

  state.isTelegramContext = true;
  const payload = await apiRequest("/api/miniapp/auth", {
    method: "POST",
    body: { initData }
  });
  state.authToken = payload.token;
  state.user = payload.user;
  return true;
}

function getOfferQuantityInput(offerKey) {
  return document.querySelector(`[data-offer-key="${CSS.escape(offerKey)}"] .qty-input`);
}

function getOrderItemQuantityInput(itemId) {
  return document.querySelector(`[data-order-item-id="${CSS.escape(String(itemId))}"] .qty-input`);
}

async function saveOffer(productId, offerKey) {
  const quantityInput = getOfferQuantityInput(offerKey);
  const quantity = Number.parseInt(quantityInput?.value ?? "1", 10);

  setStatus("Сохраняю позицию в черновик...", "neutral");
  const payload = await apiRequest("/api/me/order/items", {
    method: "POST",
    body: {
      productId,
      offerKey,
      quantity
    }
  });
  state.draftOrder = payload.order;
  await refreshOwnOrders();
  renderAll();
  setStatus("Позиция сохранена в черновике.", "success");
}

async function saveOrderItem(itemId) {
  const quantityInput = getOrderItemQuantityInput(itemId);
  const quantity = Number.parseInt(quantityInput?.value ?? "1", 10);

  setStatus("Обновляю количество...", "neutral");
  const payload = await apiRequest(`/api/me/order/items/${itemId}`, {
    method: "PATCH",
    body: {
      quantity
    }
  });
  state.draftOrder = payload.order;
  renderAll();
  setStatus("Количество обновлено.", "success");
}

async function removeOrderItem(itemId) {
  setStatus("Удаляю позицию из черновика...", "neutral");
  const payload = await apiRequest(`/api/me/order/items/${itemId}`, {
    method: "DELETE"
  });
  state.draftOrder = payload.order;
  renderAll();
  setStatus("Позиция удалена.", "success");
}

async function submitDraftOrder() {
  if (!state.draftOrder || state.draftOrder.items.length === 0) {
    setStatus("Сначала добавьте позиции в заявку.", "warning");
    return;
  }

  setStatus("Отправляю заявку...", "neutral");
  const payload = await apiRequest("/api/me/order/submit", {
    method: "POST",
    body: {
      comment: elements.draftComment.value.trim()
    }
  });

  elements.draftComment.value = "";
  await refreshDraftOrder();
  await refreshOwnOrders();
  if (state.user?.isAdmin) {
    await refreshAdminOrders();
  }
  renderAll();
  setActiveTab("orders");
  setStatus(`Заявка #${payload.order.id} отправлена.`, "success");
}

async function updateAdminOrderStatus(orderId, field, value) {
  const payload = {};

  if (field === "paymentStatus") {
    payload.paymentStatus = value;
  }

  if (field === "fulfillmentStatus") {
    payload.fulfillmentStatus = value;
  }

  setStatus("Обновляю статус заявки...", "neutral");
  await apiRequest(`/api/admin/orders/${orderId}/status`, {
    method: "PATCH",
    body: payload
  });
  await refreshAdminOrders();
  await refreshOwnOrders();
  renderAll();
  setStatus("Статус заявки обновлён.", "success");
}

function nudgeNumericInput(input, delta) {
  const currentValue = Number.parseInt(input.value ?? "1", 10);
  const nextValue = Number.isInteger(currentValue) ? currentValue + delta : 1;
  input.value = String(Math.max(1, nextValue));
}

function attachEvents() {
  elements.tabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-tab-id]");

    if (!button) {
      return;
    }

    setActiveTab(button.dataset.tabId);
  });

  elements.categoryFilters.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category-id]");

    if (!button) {
      return;
    }

    state.categoryFilter = button.dataset.categoryId || null;
    renderCategoryFilters();
    renderCatalog();
  });

  elements.catalogList.addEventListener("click", async (event) => {
    const target = event.target;
    const actionButton = target.closest("[data-action]");

    if (!actionButton) {
      return;
    }

    try {
      if (actionButton.dataset.action === "save-offer") {
        await saveOffer(actionButton.dataset.productId, actionButton.dataset.offerKey);
      }

      if (actionButton.dataset.action === "increase-offer-qty") {
        nudgeNumericInput(actionButton.parentElement.querySelector(".qty-input"), 1);
      }

      if (actionButton.dataset.action === "decrease-offer-qty") {
        nudgeNumericInput(actionButton.parentElement.querySelector(".qty-input"), -1);
      }
    } catch (error) {
      setStatus(error.message, "error");
    }
  });

  elements.draftList.addEventListener("click", async (event) => {
    const target = event.target;
    const actionButton = target.closest("[data-action]");

    if (!actionButton) {
      return;
    }

    try {
      if (actionButton.dataset.action === "save-order-item") {
        await saveOrderItem(actionButton.dataset.orderItemId);
      }

      if (actionButton.dataset.action === "remove-order-item") {
        await removeOrderItem(actionButton.dataset.orderItemId);
      }

      if (actionButton.dataset.action === "increase-order-item-qty") {
        nudgeNumericInput(actionButton.parentElement.querySelector(".qty-input"), 1);
      }

      if (actionButton.dataset.action === "decrease-order-item-qty") {
        nudgeNumericInput(actionButton.parentElement.querySelector(".qty-input"), -1);
      }
    } catch (error) {
      setStatus(error.message, "error");
    }
  });

  elements.adminFilters.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-admin-filter-key]");

    if (!button) {
      return;
    }

    state.adminFilters = {
      lifecycleStatus: null,
      paymentStatus: null,
      fulfillmentStatus: null,
      [button.dataset.adminFilterKey]: button.dataset.adminFilterValue || null
    };

    try {
      await refreshAdminOrders();
      renderAdminFilters();
      renderAdminOrders();
    } catch (error) {
      setStatus(error.message, "error");
    }
  });

  elements.adminOrdersList.addEventListener("click", async (event) => {
    const button = event.target.closest('[data-action="admin-update-status"]');

    if (!button) {
      return;
    }

    try {
      await updateAdminOrderStatus(
        button.dataset.orderId,
        button.dataset.statusField,
        button.dataset.statusValue
      );
    } catch (error) {
      setStatus(error.message, "error");
    }
  });

  elements.refreshButton.addEventListener("click", async () => {
    try {
      setStatus("Обновляю каталог и черновик...", "neutral");
      await refreshAllData();
      setStatus("Данные обновлены.", "success");
    } catch (error) {
      setStatus(error.message, "error");
    }
  });

  elements.adminRefreshButton.addEventListener("click", async () => {
    try {
      setStatus("Обновляю список заявок...", "neutral");
      await refreshAdminOrders();
      renderAdminOrders();
      setStatus("Список заявок обновлён.", "success");
    } catch (error) {
      setStatus(error.message, "error");
    }
  });

  elements.submitOrderButton.addEventListener("click", async () => {
    try {
      await submitDraftOrder();
    } catch (error) {
      setStatus(error.message, "error");
    }
  });
}

async function bootstrap() {
  attachEvents();

  if (telegramWebApp) {
    telegramWebApp.ready();
    telegramWebApp.expand();
  }

  try {
    const authenticated = await authenticate();

    if (!authenticated) {
      return;
    }

    setStatus("Загружаю каталог и ваши заявки...", "neutral");
    await refreshAllData();
    renderAll();
    setStatus("Mini App готов к работе.", "success");
  } catch (error) {
    console.error(error);
    setStatus(error instanceof Error ? error.message : String(error), "error");
  }
}

bootstrap();
