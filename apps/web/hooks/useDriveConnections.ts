import useSWR from "swr";
import type { GetDriveConnectionsResponse } from "@/app/api/user/drive/connections/route";

export function useDriveConnections() {
  return useSWR<GetDriveConnectionsResponse>("/api/user/drive/connections");
}
