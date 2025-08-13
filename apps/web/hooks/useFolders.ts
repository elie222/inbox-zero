import type { OutlookFolder } from "@/utils/outlook/folders";
import useSWR from "swr";

export function useFolders({ emailAccountId }: { emailAccountId: string }) {
  const searchParams = new URLSearchParams();
  if (emailAccountId) searchParams.set("emailAccountId", emailAccountId);

  const url = `/api/user/folders?${searchParams.toString()}`;
  const { data, error, isLoading, mutate } = useSWR<OutlookFolder[]>(url);

  return { folders: data || [], isLoading, error, mutate };
}
