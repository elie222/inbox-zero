import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("mcp-server-url");

// Production ignores overrides to prevent redirecting bearer tokens.
export function getMcpServerUrl(integration: {
  name: string;
  serverUrl?: string;
}): string | undefined {
  if (env.NODE_ENV === "production") return integration.serverUrl;
  if (!env.MCP_SERVER_URL_OVERRIDES) return integration.serverUrl;

  try {
    const overrides: unknown = JSON.parse(env.MCP_SERVER_URL_OVERRIDES);
    if (overrides && typeof overrides === "object") {
      const override = (overrides as Record<string, unknown>)[integration.name];
      if (typeof override === "string") return override;
    }
  } catch (error) {
    logger.warn("Invalid MCP_SERVER_URL_OVERRIDES, ignoring", { error });
  }

  return integration.serverUrl;
}
