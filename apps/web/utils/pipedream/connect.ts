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
