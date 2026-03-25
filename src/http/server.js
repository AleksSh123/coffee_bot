import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

import { getCatalogOfferKey } from "../catalog/offer-key.js";
import { createHttpError } from "../lib/http-error.js";

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS"
};
const maxJsonBodyBytes = 256 * 1024;
const miniAppStaticFiles = new Map([
  [
    "/miniapp",
    {
      contentType: "text/html; charset=utf-8",
      fileUrl: new URL("../../web/miniapp/index.html", import.meta.url)
    }
  ],
  [
    "/miniapp/",
    {
      contentType: "text/html; charset=utf-8",
      fileUrl: new URL("../../web/miniapp/index.html", import.meta.url)
    }
  ],
  [
    "/miniapp/app.js",
    {
      contentType: "application/javascript; charset=utf-8",
      fileUrl: new URL("../../web/miniapp/app.js", import.meta.url)
    }
  ],
  [
    "/miniapp/styles.css",
    {
      contentType: "text/css; charset=utf-8",
      fileUrl: new URL("../../web/miniapp/styles.css", import.meta.url)
    }
  ]
]);

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, jsonHeaders);
  response.end(JSON.stringify(payload));
}

async function sendStaticFile(response, contentType, fileUrl) {
  const content = await readFile(fileUrl);
  response.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "no-store"
  });
  response.end(content);
}

function sendNoContent(response) {
  response.writeHead(204, jsonHeaders);
  response.end();
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalLength = 0;

    request.on("data", (chunk) => {
      totalLength += chunk.length;

      if (totalLength > maxJsonBodyBytes) {
        reject(createHttpError(413, "Request body is too large", "request_body_too_large"));
        request.destroy();
        return;
      }

      chunks.push(chunk);
    });

    request.on("error", reject);
    request.on("end", () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(createHttpError(400, "Request body must be valid JSON", "request_body_invalid"));
      }
    });
  });
}

function getBearerToken(request) {
  const authorizationHeader = request.headers.authorization ?? "";
  const [scheme, token] = authorizationHeader.split(/\s+/, 2);

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw createHttpError(401, "Authorization bearer token is required", "auth_missing");
  }

  return token;
}

function serializeCategoryNode(node) {
  return {
    id: String(node.id),
    name: node.name,
    parentId: node.parentId ? String(node.parentId) : null,
    pathLabel: node.pathLabel,
    totalItemCount: node.totalItemCount,
    branchCategoryIds: node.branchCategoryIds.map((categoryId) => String(categoryId)),
    children: node.children.map(serializeCategoryNode)
  };
}

function serializeCatalog(snapshot, catalogService) {
  const nonEmptyCategories = catalogService.getAvailableCategories().map((category) => ({
    id: String(category.id),
    name: category.name,
    pathLabel: category.pathLabel
  }));

  const items = snapshot.items.map((item) => ({
    id: String(item.id),
    name: item.name,
    categoryId:
      item.category_id !== undefined && item.category_id !== null ? String(item.category_id) : null,
    categoryName: snapshot.categoriesById.get(item.category_id)?.name ?? null,
    labelName: item.label?.name ?? null,
    offers: (Array.isArray(item.offers) ? item.offers : []).map((offer) => ({
      offerKey: getCatalogOfferKey(offer),
      name: offer.name ?? null,
      type: offer.type ?? null,
      weight:
        Number.isFinite(Number(offer.weight)) && Number(offer.weight) > 0
          ? Number(offer.weight)
          : null,
      price: Number.isFinite(Number(offer.price)) ? Number(offer.price) : null
    }))
  }));

  return {
    refreshedAt:
      snapshot.lastRefreshedAt > 0 ? new Date(snapshot.lastRefreshedAt).toISOString() : null,
    currentOrderContext: snapshot.orderContext ?? null,
    pricesValidText: snapshot.pricesValidText ?? null,
    categories: nonEmptyCategories,
    categoryTree: catalogService.getCategoryTree().map(serializeCategoryNode),
    items
  };
}

function parseOrderFilters(url) {
  return {
    orderContextStatus: url.searchParams.get("order_context_status") ?? null
  };
}

function isPathMatch(pathname, pattern) {
  const pathnameParts = pathname.split("/").filter(Boolean);
  const patternParts = pattern.split("/").filter(Boolean);

  if (pathnameParts.length !== patternParts.length) {
    return null;
  }

  const params = {};

  for (let index = 0; index < patternParts.length; index += 1) {
    const patternPart = patternParts[index];
    const pathnamePart = pathnameParts[index];

    if (patternPart.startsWith(":")) {
      params[patternPart.slice(1)] = pathnamePart;
      continue;
    }

    if (patternPart !== pathnamePart) {
      return null;
    }
  }

  return params;
}

export function createApiServer({
  config,
  catalogService,
  orderService,
  miniAppAuth,
  logger
}) {
  if (!config.api.enabled) {
    return {
      async start() {},
      async stop() {}
    };
  }

  let server = null;

  async function requireIdentity(request) {
    const sessionToken = getBearerToken(request);
    return miniAppAuth.verifySessionToken(sessionToken);
  }

  async function handleRequest(request, response) {
    const startedAt = Date.now();
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    let statusCode = 200;

    try {
      if (request.method === "OPTIONS") {
        sendNoContent(response);
        return;
      }

      if (request.method === "GET" && miniAppStaticFiles.has(url.pathname)) {
        const asset = miniAppStaticFiles.get(url.pathname);
        await sendStaticFile(response, asset.contentType, asset.fileUrl);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/health") {
        sendJson(response, 200, {
          status: "ok"
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/miniapp/auth") {
        const body = await readJsonBody(request);
        const identity = miniAppAuth.validateInitData(body.initData);
        const user = await orderService.upsertTelegramUser(identity);
        const sessionToken = miniAppAuth.issueSessionToken(identity);

        sendJson(response, 200, {
          token: sessionToken,
          expiresAt: new Date((miniAppAuth.verifySessionToken(sessionToken).expiresAt ?? 0) * 1000).toISOString(),
          user
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/catalog") {
        const snapshot = await catalogService.getCatalogSnapshot();
        sendJson(response, 200, serializeCatalog(snapshot, catalogService));
        return;
      }

      const identity = await requireIdentity(request);

      if (request.method === "GET" && url.pathname === "/api/me") {
        const user = await orderService.ensureTelegramUser(identity);
        sendJson(response, 200, {
          user
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/me/order") {
        const order = await orderService.getDraftOrder(identity);
        sendJson(response, 200, {
          order
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/me/order/items") {
        const body = await readJsonBody(request);
        const order = await orderService.addDraftOrderItem(identity, body);
        sendJson(response, 200, {
          order
        });
        return;
      }

      const updateItemParams = isPathMatch(url.pathname, "/api/me/order/items/:itemId");

      if (request.method === "PATCH" && updateItemParams) {
        const body = await readJsonBody(request);
        const order = await orderService.updateDraftOrderItem(
          identity,
          updateItemParams.itemId,
          body
        );
        sendJson(response, 200, {
          order
        });
        return;
      }

      if (request.method === "DELETE" && updateItemParams) {
        const order = await orderService.removeDraftOrderItem(identity, updateItemParams.itemId);
        sendJson(response, 200, {
          order
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/me/order/submit") {
        const body = await readJsonBody(request);
        const order = await orderService.submitDraftOrder(identity, body);
        sendJson(response, 200, {
          order
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/me/orders") {
        const orders = await orderService.listOwnOrders(identity);
        sendJson(response, 200, {
          orders
        });
        return;
      }

      const ownOrderParams = isPathMatch(url.pathname, "/api/me/orders/:orderId");

      if (request.method === "GET" && ownOrderParams) {
        const order = await orderService.getOwnOrder(identity, ownOrderParams.orderId);
        sendJson(response, 200, {
          order
        });
        return;
      }

      if (!identity.isAdmin) {
        throw createHttpError(403, "Administrator access is required", "admin_access_required");
      }

      if (request.method === "GET" && url.pathname === "/api/admin/orders") {
        const orders = await orderService.listAdminOrders(parseOrderFilters(url));
        sendJson(response, 200, {
          orders
        });
        return;
      }

      const adminOrderParams = isPathMatch(url.pathname, "/api/admin/orders/:orderId");

      if (request.method === "GET" && adminOrderParams) {
        const order = await orderService.getAdminOrder(adminOrderParams.orderId);
        sendJson(response, 200, {
          order
        });
        return;
      }

      const adminStatusParams = isPathMatch(url.pathname, "/api/admin/orders/:orderId/status");

      if (request.method === "PATCH" && adminStatusParams) {
        const body = await readJsonBody(request);
        const order = await orderService.updateAdminOrderStatuses(
          adminStatusParams.orderId,
          body
        );
        sendJson(response, 200, {
          order
        });
        return;
      }

      const adminOrderContextStatusParams = isPathMatch(
        url.pathname,
        "/api/admin/order-contexts/:orderContextKey/status"
      );

      if (request.method === "PATCH" && adminOrderContextStatusParams) {
        const body = await readJsonBody(request);
        const orderContext = await orderService.updateAdminOrderContextStatus(
          adminOrderContextStatusParams.orderContextKey,
          body
        );
        sendJson(response, 200, {
          orderContext
        });
        return;
      }

      throw createHttpError(404, "Route was not found", "route_not_found");
    } catch (error) {
      statusCode = error?.status ?? 500;

      if (url.pathname === "/api/miniapp/auth" || statusCode >= 500) {
        logger.warn("api.request.rejected", {
          method: request.method,
          path: url.pathname,
          status: statusCode,
          error_code: error?.code ?? "internal_error",
          error: error instanceof Error ? error.message : String(error)
        });
      }

      if (statusCode >= 500) {
        logger.error("api.request.failed", {
          method: request.method,
          path: url.pathname,
          error: error instanceof Error ? error.message : String(error)
        });
      }

      sendJson(response, statusCode, {
        error: {
          code: error?.code ?? "internal_error",
          message: error instanceof Error ? error.message : String(error),
          details: error?.details ?? null
        }
      });
    } finally {
      logger.debug("api.request.completed", {
        method: request.method,
        path: url.pathname,
        status: statusCode,
        duration_ms: Date.now() - startedAt
      });
    }
  }

  return {
    async start() {
      if (server) {
        return;
      }

      server = createServer((request, response) => {
        handleRequest(request, response);
      });

      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(config.api.port, config.api.host, resolve);
      });

      logger.info("api.server.started", {
        host: config.api.host,
        port: config.api.port
      });
    },
    async stop() {
      if (!server) {
        return;
      }

      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });

      logger.info("api.server.stopped", {
        host: config.api.host,
        port: config.api.port
      });
      server = null;
    }
  };
}
