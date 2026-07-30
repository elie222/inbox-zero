import useSWR from "swr";
import type { GetAdminUsersResponse } from "@/app/api/admin/users/route";

export function useAdminUsers({
  page,
  search,
  filter,
}: {
  page: number;
  search: string;
  filter: string;
}) {
  const params = new URLSearchParams({ page: String(page) });
  if (search) params.set("q", search);
  if (filter !== "all") params.set("filter", filter);

  return useSWR<GetAdminUsersResponse>(`/api/admin/users?${params.toString()}`);
}
