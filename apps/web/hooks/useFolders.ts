import type { OutlookFolder } from "@/utils/outlook/folders";
import useSWR from "swr";

export function useFolders() {
  const { data, error, isLoading, mutate } =
    useSWR<OutlookFolder[]>("/api/user/folders");
  return { folders: data || [], isLoading, error, mutate };
}
