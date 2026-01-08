import useSWR from "swr";
import type { PluginUpdatesResponse } from "@/app/api/user/plugins/updates/route";

export function usePluginUpdates() {
  const { data, isLoading, error, mutate } = useSWR<PluginUpdatesResponse>(
    "/api/user/plugins/updates",
    {
      refreshInterval: 1000 * 60 * 30,
      revalidateOnFocus: false,
    },
  );

  return {
    updates: data?.updates || [],
    updateCount: data?.updates.length || 0,
    isLoading,
    error,
    mutate,
  };
}
