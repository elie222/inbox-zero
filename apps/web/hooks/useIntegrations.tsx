import useSWR from "swr";
import type { GetMcpRegistryResponse } from "@/app/api/mcp/registry/route";

export function useIntegrations() {
  return useSWR<GetMcpRegistryResponse>("/api/mcp/registry");
}
