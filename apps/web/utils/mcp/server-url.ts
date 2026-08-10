import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("mcp-server-url");

// Server-only: resolves an integration's MCP server URL, honoring
// MCP_SERVER_URL_OVERRIDES so dev/tests can point at a local emulator.
export function getMcpServerUrl(integration: {
  name: string;
  serverUrl?: string;
}): string | undefined {
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
