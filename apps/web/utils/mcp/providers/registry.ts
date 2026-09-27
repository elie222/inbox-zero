import { composioProvider } from "@/utils/mcp/providers/composio";
import type {
  IntegrationProvider,
  IntegrationProviderId,
} from "@/utils/mcp/providers/types";

const PROVIDERS: Record<IntegrationProviderId, IntegrationProvider> = {
  composio: composioProvider,
};

export function getIntegrationProvider(
  id: IntegrationProviderId,
): IntegrationProvider {
  return PROVIDERS[id];
}
