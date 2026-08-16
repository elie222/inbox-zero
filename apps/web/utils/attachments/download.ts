import { fetchWithAccount } from "@/utils/fetch";

export async function fetchAttachment({
  url,
  emailAccountId,
}: {
  url: string;
  emailAccountId: string;
}): Promise<Blob> {
  const response = await fetchWithAccount({ url, emailAccountId });

  if (!response.ok) {
    throw new Error("Failed to download attachment");
  }

  return response.blob();
}
