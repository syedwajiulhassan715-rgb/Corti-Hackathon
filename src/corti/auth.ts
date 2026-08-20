import type { CortiCredentials, CortiEnvironment } from "./transcribe.ts";

export interface CortiAuthConfig {
  readonly tenantName: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly environment: CortiEnvironment;
}

interface TokenResponse {
  readonly access_token: string;
  readonly expires_in?: number;
}

export interface CortiAuthDeps {
  readonly fetch?: typeof globalThis.fetch;
  readonly now?: () => number;
}

const REFRESH_AFTER_MS = 240_000;

export function createCortiAuth(
  config: CortiAuthConfig,
  deps: CortiAuthDeps = {},
): CortiCredentials {
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const now = deps.now ?? Date.now;

  let accessToken: string | undefined;
  let obtainedAt = 0;

  return {
    tenantName: config.tenantName,
    environment: config.environment,

    async getToken(): Promise<string> {
      if (
        accessToken !== undefined &&
        now() - obtainedAt < REFRESH_AFTER_MS
      ) {
        return accessToken;
      }

      const token = await requestToken(config, fetchImpl);

      accessToken = token.access_token;
      obtainedAt = now();

      return accessToken;
    },
  };
}

async function requestToken(
  config: CortiAuthConfig,
  fetchImpl: typeof globalThis.fetch,
): Promise<TokenResponse> {
  const response = await fetchImpl(tokenUrl(config.environment, config.tenantName), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Corti authentication failed: HTTP ${response.status} ${await response.text()}`,
    );
  }

  return (await response.json()) as TokenResponse;
}

// Keycloak, realm-scoped per tenant. Not a guess: the path comes from the
// server's own OIDC discovery document at
//   https://auth.<env>.corti.app/realms/<tenant>/.well-known/openid-configuration
// which names this exact token_endpoint. The unscoped /oauth2/token that used
// to be here 404s with "Unable to find matching target resource method".
function tokenUrl(environment: CortiEnvironment, tenantName: string): string {
  return `https://auth.${environment}.corti.app/realms/${tenantName}/protocol/openid-connect/token`;
}