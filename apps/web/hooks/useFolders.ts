import useSWR from "swr";
import type { GetFoldersResponse } from "@/app/api/user/folders/route";

export function useFolders() {
  const { data, error, isLoading, mutate } =
    useSWR<GetFoldersResponse>("/api/user/folders");
  return { folders: data || [], isLoading, error, mutate };
}
