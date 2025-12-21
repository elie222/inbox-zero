import useSWR from "swr";
import type {
  GetFilingsResponse,
  GetFilingsQuery,
} from "@/app/api/user/drive/filings/route";

export function useFilingActivity(limit: GetFilingsQuery["limit"] = 10) {
  const url = `/api/user/drive/filings?limit=${limit}`;

  return useSWR<GetFilingsResponse>(url, {
    revalidateOnFocus: false,
  });
}
