import useSWR from "swr";
import type { GetFilingsResponse } from "@/app/api/user/drive/filings/route";
import type { GetFilingsQuery } from "@/app/api/user/drive/filings/validation";

export function useFilingActivity({ limit, offset }: GetFilingsQuery) {
  const url = `/api/user/drive/filings?limit=${limit}&offset=${offset}`;
  return useSWR<GetFilingsResponse>(url, { revalidateOnFocus: false });
}
