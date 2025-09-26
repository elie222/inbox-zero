import useSWR from "swr";
import type { GetMcpConnectionsResponse } from "@/app/api/mcp/connections/route";

export function useMcpConnections() {
  return useSWR<GetMcpConnectionsResponse>("/api/mcp/connections");
}
