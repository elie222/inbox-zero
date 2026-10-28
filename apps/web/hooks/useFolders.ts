import useSWR from "swr";
import type { GetFoldersResponse } from "@/app/api/user/folders/route";
import { isMicrosoftProvider } from "@/utils/email/provider-types";

export function useFolders(provider: string, emailAccountId?: string) {
  const enabled = isMicrosoftProvider(provider);
  const key = emailAccountId
    ? ["/api/user/folders", emailAccountId]
    : "/api/user/folders";
  const { data, error, isLoading, mutate } = useSWR<GetFoldersResponse>(
    enabled ? key : null,
  );
  return {
    folders: data || [],
    isLoading: enabled ? !!isLoading : false,
    error,
    mutate,
  };
}
