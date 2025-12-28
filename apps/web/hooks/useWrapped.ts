import useSWR from "swr";
import type { GetWrappedResponse } from "@/app/api/user/wrapped/route";

export function useWrapped(year: number) {
  const url = `/api/user/wrapped?year=${year}`;
  return useSWR<GetWrappedResponse>(url);
}
