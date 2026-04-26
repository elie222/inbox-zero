import useSWR from "swr";
import type { GetDriveSourceItemsResponse } from "@/app/api/user/drive/source-items/route";

export function useDriveSourceItems(shouldFetch = true) {
  return useSWR<GetDriveSourceItemsResponse>(
    shouldFetch ? "/api/user/drive/source-items" : null,
  );
}
