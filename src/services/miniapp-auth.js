import { createHmac, timingSafeEqual } from "node:crypto";

import { createHttpError } from "../lib/http-error.js";

function encodeBase64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function decodeBase64Url(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function createSignature(secret, value) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function parseInitData(initData) {
  const normalizedInitData = typeof initData === "string" ? initData.trim() : "";

  if (!normalizedInitData) {
    throw createHttpError(400, "initData is required", "miniapp_auth_missing_init_data");
  }

  const params = new URLSearchParams(normalizedInitData);
  const hash = params.get("hash");

  if (!hash) {
    throw createHttpError(400, "initData hash is missing", "miniapp_auth_missing_hash");
  }

  const fields = [];

  for (const [key, value] of params.entries()) {
    if (key === "hash" || key === "signature") {
      continue;
    }

    fields.push([key, value]);
  }

  fields.sort(([left], [right]) => left.localeCompare(right));

  return {
    hash,
    dataCheckString: fields.map(([key, value]) => `${key}=${value}`).join("\n"),
    rawUser: params.get("user"),
    authDate: Number.parseInt(params.get("auth_date") ?? "", 10),
    queryId: params.get("query_id")
  };
}

function validateHash(hash, expectedHash) {
  const hashBuffer = Buffer.from(hash, "hex");
  const expectedHashBuffer = Buffer.from(expectedHash, "hex");

  if (hashBuffer.length !== expectedHashBuffer.length) {
    return false;
  }

  return timingSafeEqual(hashBuffer, expectedHashBuffer);
}

export function createMiniAppAuth({
  botToken,
  sessionSecret,
  sessionTtlSeconds,
  authMaxAgeSeconds,
  adminTelegramUserIds
}) {
  function validateInitData(initData) {
    const { hash, dataCheckString, rawUser, authDate, queryId } = parseInitData(initData);
    const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
    const expectedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

    if (!validateHash(hash, expectedHash)) {
      throw createHttpError(401, "Mini App auth data is invalid", "miniapp_auth_invalid_hash");
    }

    if (!Number.isFinite(authDate) || authDate <= 0) {
      throw createHttpError(401, "Mini App auth date is invalid", "miniapp_auth_invalid_auth_date");
    }

    if (Date.now() - authDate * 1000 > authMaxAgeSeconds * 1000) {
      throw createHttpError(401, "Mini App auth data has expired", "miniapp_auth_expired");
    }

    let user = null;

    if (rawUser) {
      try {
        user = JSON.parse(rawUser);
      } catch {
        throw createHttpError(400, "Mini App user payload is invalid", "miniapp_auth_invalid_user");
      }
    }

    if (!user?.id) {
      throw createHttpError(401, "Mini App user payload is missing", "miniapp_auth_missing_user");
    }

    const telegramUserId = String(user.id);
    const isAdmin = adminTelegramUserIds.has(telegramUserId);

    return {
      telegramUserId,
      username: user.username ?? null,
      firstName: user.first_name ?? null,
      lastName: user.last_name ?? null,
      languageCode: user.language_code ?? null,
      isAdmin,
      authDate,
      queryId
    };
  }

  function issueSessionToken(identity) {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      telegramUserId: identity.telegramUserId,
      isAdmin: Boolean(identity.isAdmin),
      iat: now,
      exp: now + sessionTtlSeconds
    };
    const serializedPayload = JSON.stringify(payload);
    const encodedPayload = encodeBase64Url(serializedPayload);
    const signature = createSignature(sessionSecret, encodedPayload);

    return `${encodedPayload}.${signature}`;
  }

  function verifySessionToken(token) {
    const [encodedPayload, signature] = String(token ?? "").split(".");

    if (!encodedPayload || !signature) {
      throw createHttpError(401, "Session token is malformed", "session_token_invalid");
    }

    const expectedSignature = createSignature(sessionSecret, encodedPayload);
    const signatureBuffer = Buffer.from(signature);
    const expectedSignatureBuffer = Buffer.from(expectedSignature);

    if (
      signatureBuffer.length !== expectedSignatureBuffer.length ||
      !timingSafeEqual(signatureBuffer, expectedSignatureBuffer)
    ) {
      throw createHttpError(401, "Session token signature is invalid", "session_token_invalid");
    }

    let payload = null;

    try {
      payload = JSON.parse(decodeBase64Url(encodedPayload));
    } catch {
      throw createHttpError(401, "Session token payload is invalid", "session_token_invalid");
    }

    if (!payload?.telegramUserId || !payload?.exp) {
      throw createHttpError(401, "Session token payload is incomplete", "session_token_invalid");
    }

    if (Math.floor(Date.now() / 1000) >= payload.exp) {
      throw createHttpError(401, "Session token has expired", "session_token_expired");
    }

    return {
      telegramUserId: String(payload.telegramUserId),
      isAdmin: Boolean(payload.isAdmin),
      issuedAt: payload.iat,
      expiresAt: payload.exp
    };
  }

  return {
    issueSessionToken,
    validateInitData,
    verifySessionToken
  };
}
