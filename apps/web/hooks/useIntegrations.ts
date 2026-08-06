import useSWR from "swr";
import type { GetIntegrationsResponse } from "@/app/api/mcp/integrations/route";

export function useIntegrations() {
  return useSWR<GetIntegrationsResponse>("/api/mcp/integrations");
}
