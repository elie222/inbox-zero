import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("pipedream-connect");

const PIPEDREAM_API_BASE = "https://api.pipedream.com/v1";

export type PipedreamConnectConfig = {
  projectId: string;
  clientId: string;
  clientSecret: string;
  environment: "development" | "production";
};

export type RunActionParams = {
  actionId: string;
  externalUserId: string;
  configuredProps: Record<string, unknown>;
};

export type RunActionResult = {
  exports: unknown;
  os: unknown;
  ret: unknown;
  stash_id?: string;
};

export type CreateConnectTokenParams = {
  externalUserId: string;
  successRedirectUri?: string;
  errorRedirectUri?: string;
};

export type ConnectTokenResult = {
  token: string;
  connect_link_url: string;
  expires_at: string;
};

export type ConnectedAccount = {
  id: string;
  name: string;
  external_id: string;
  healthy: boolean;
  dead: boolean;
  app: {
    id: string;
    name_slug: string;
    name: string;
  };
  created_at: string;
  updated_at: string;
};

/**
 * Get Pipedream Connect configuration from environment variables
 */
export function getPipedreamConnectConfig(): PipedreamConnectConfig | null {
  const projectId = env.PIPEDREAM_PROJECT_ID;
  const clientId = env.PIPEDREAM_CLIENT_ID;
  const clientSecret = env.PIPEDREAM_CLIENT_SECRET;

  if (!projectId || !clientId || !clientSecret) {
    return null;
  }

  return {
    projectId,
    clientId,
    clientSecret,
    environment:
      env.PIPEDREAM_ENVIRONMENT === "production" ? "production" : "development",
  };
}

/**
 * Run a Pipedream Connect action
 *
 * @see https://pipedream.com/docs/connect/api-reference/run-action
 */
export async function runPipedreamAction(
  params: RunActionParams,
): Promise<RunActionResult> {
  const config = getPipedreamConnectConfig();

  if (!config) {
    throw new Error(
      "Pipedream Connect not configured. Set PIPEDREAM_PROJECT_ID, PIPEDREAM_CLIENT_ID, and PIPEDREAM_CLIENT_SECRET environment variables.",
    );
  }

  const log = logger.with({
    actionId: params.actionId,
    externalUserId: params.externalUserId,
  });

  log.info("Running Pipedream action");

  const accessToken = await getAccessToken(config);

  const response = await fetch(
    `${PIPEDREAM_API_BASE}/connect/${config.projectId}/actions/run`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "x-pd-environment": config.environment,
      },
      body: JSON.stringify({
        id: params.actionId,
        external_user_id: params.externalUserId,
        configured_props: params.configuredProps,
      }),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    log.error("Pipedream action failed", { error, status: response.status });
    throw new Error(`Pipedream action failed: ${error}`);
  }

  const result = (await response.json()) as RunActionResult;
  log.info("Pipedream action completed", { result });

  return result;
}

/**
 * Check if Pipedream Connect is configured
 */
export function isPipedreamConnectConfigured(): boolean {
  return getPipedreamConnectConfig() !== null;
}

/**
 * Create a connect token for OAuth flow
 *
 * @see https://pipedream.com/docs/connect/api-reference/create-connect-token
 */
export async function createConnectToken(
  params: CreateConnectTokenParams,
): Promise<ConnectTokenResult> {
  const config = getPipedreamConnectConfig();

  if (!config) {
    throw new Error(
      "Pipedream Connect not configured. Set PIPEDREAM_PROJECT_ID, PIPEDREAM_CLIENT_ID, and PIPEDREAM_CLIENT_SECRET environment variables.",
    );
  }

  const log = logger.with({ externalUserId: params.externalUserId });
  log.info("Creating Pipedream connect token");

  const accessToken = await getAccessToken(config);

  const response = await fetch(
    `${PIPEDREAM_API_BASE}/connect/${config.projectId}/tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "x-pd-environment": config.environment,
      },
      body: JSON.stringify({
        external_user_id: params.externalUserId,
        success_redirect_uri: params.successRedirectUri,
        error_redirect_uri: params.errorRedirectUri,
      }),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    log.error("Failed to create connect token", {
      error,
      status: response.status,
    });
    throw new Error(`Failed to create connect token: ${error}`);
  }

  const result = (await response.json()) as ConnectTokenResult;
  log.info("Created connect token", { expiresAt: result.expires_at });

  return result;
}

/**
 * Get connected accounts for a user
 *
 * @see https://pipedream.com/docs/connect/api-reference/list-accounts
 */
export async function getConnectedAccounts(
  externalUserId: string,
  appSlug?: string,
): Promise<ConnectedAccount[]> {
  const config = getPipedreamConnectConfig();

  if (!config) {
    throw new Error(
      "Pipedream Connect not configured. Set PIPEDREAM_PROJECT_ID, PIPEDREAM_CLIENT_ID, and PIPEDREAM_CLIENT_SECRET environment variables.",
    );
  }

  const log = logger.with({ externalUserId, appSlug });
  log.info("Getting connected accounts");

  const accessToken = await getAccessToken(config);

  const params = new URLSearchParams({
    external_user_id: externalUserId,
  });
  if (appSlug) {
    params.set("app", appSlug);
  }

  const response = await fetch(
    `${PIPEDREAM_API_BASE}/connect/${config.projectId}/accounts?${params.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "x-pd-environment": config.environment,
      },
    },
  );

  if (!response.ok) {
    const error = await response.text();
    log.error("Failed to get connected accounts", {
      error,
      status: response.status,
    });
    throw new Error(`Failed to get connected accounts: ${error}`);
  }

  const result = (await response.json()) as { data: ConnectedAccount[] };
  log.info("Got connected accounts", { count: result.data.length });

  return result.data;
}

// Helper functions

async function getAccessToken(config: PipedreamConnectConfig): Promise<string> {
  const response = await fetch(`${PIPEDREAM_API_BASE}/oauth/token`, {
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
    const error = await response.text();
    throw new Error(`Failed to get Pipedream access token: ${error}`);
  }

  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}
