import useSWR from "swr";
import type { GetDriveFoldersResponse } from "@/app/api/user/drive/folders/route";

export function useDriveFolders() {
  return useSWR<GetDriveFoldersResponse>("/api/user/drive/folders");
}
