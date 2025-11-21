import useSWR from "swr";
import type { GetFoldersResponse } from "@/app/api/user/folders/route";
import { isMicrosoftProvider } from "@/utils/email/provider-types";

export function useFolders(provider: string) {
  const enabled = isMicrosoftProvider(provider);
  const { data, error, isLoading, mutate } = useSWR<GetFoldersResponse>(
    enabled ? "/api/user/folders" : null,
  );
  return {
    folders: data || [],
    isLoading: enabled ? !!isLoading : false,
    error,
    mutate,
  };
}
