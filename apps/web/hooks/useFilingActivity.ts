import useSWR from "swr";
import type {
  GetFilingsResponse,
  GetFilingsQuery,
} from "@/app/api/user/drive/filings/route";

export function useFilingActivity({ limit, offset }: GetFilingsQuery) {
  const url = `/api/user/drive/filings?limit=${limit}&offset=${offset}`;
  return useSWR<GetFilingsResponse>(url, { revalidateOnFocus: false });
}
