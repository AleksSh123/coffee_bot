function normalizeTokenType(value) {
  if (!value) {
    return "Bearer";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function createTastyAuthService({ state, config, fetchJson, logger }) {
  async function login() {
    logger.info("tasty.auth.login.start", {
      api_base_url: config.tasty.apiBaseUrl,
      login: config.tasty.login
    });

    const response = await fetchJson(`${config.tasty.apiBaseUrl}/auth/login`, {
      logContext: "tasty.auth.login",
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: {
        login: config.tasty.login,
        password: config.tasty.password,
        privacy_agreement: config.tasty.privacyAgreement
      }
    });

    const data = response?.data;
    const accessToken = data?.access_token;
    const expiresInSeconds = Number.parseInt(`${data?.expires_in ?? 0}`, 10);

    if (!accessToken) {
      throw new Error("Tasty Coffee auth response did not include access_token");
    }

    const refreshSkewMs = 60_000;
    const expiresInMs =
      Number.isFinite(expiresInSeconds) && expiresInSeconds > 0
        ? expiresInSeconds * 1000
        : 0;
    const expiresAt = Date.now() + Math.max(0, expiresInMs - refreshSkewMs);

    state.auth = {
      accessToken,
      tokenType: normalizeTokenType(data?.token_type),
      expiresAt
    };

    logger.info("tasty.auth.login.success", {
      expires_in_seconds: expiresInSeconds,
      expires_at: new Date(expiresAt).toISOString(),
      token_type: state.auth.tokenType
    });
  }

  function hasValidToken() {
    return Boolean(state.auth.accessToken) && Date.now() < state.auth.expiresAt;
  }

  function getAuthorizationHeader() {
    return `${state.auth.tokenType} ${state.auth.accessToken}`;
  }

  return {
    getAuthorizationHeader,
    hasValidToken,
    login
  };
}
