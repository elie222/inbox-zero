import useSWR from "swr";
import type { GetAdminErrorsResponse } from "@/app/api/admin/errors/route";

export function useAdminErrors() {
  return useSWR<GetAdminErrorsResponse>("/api/admin/errors");
}
