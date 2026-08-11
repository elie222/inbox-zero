import useSWR from "swr";
import type { GetIntegrationArgOptionsResponse } from "@/app/api/mcp/[integration]/arg-options/route";

/**
 * Loads the selectable options for a remote-select integration argument.
 * The spec decides which read tool is called, so this works for any
 * integration without a per-integration hook.
 */
export function useIntegrationArgOptions({
  integration,
  tool,
  argKey,
  enabled,
}: {
  integration: string | null | undefined;
  tool: string | null | undefined;
  argKey: string | null | undefined;
  enabled: boolean;
}) {
  const canFetch = enabled && !!integration && !!tool && !!argKey;
  const query = new URLSearchParams({ tool: tool ?? "", argKey: argKey ?? "" });

  return useSWR<GetIntegrationArgOptionsResponse>(
    canFetch
      ? `/api/mcp/${encodeURIComponent(integration)}/arg-options?${query}`
      : null,
  );
}
