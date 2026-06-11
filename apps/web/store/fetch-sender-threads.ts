import type { GetThreadsResponse } from "@/app/api/threads/basic/route";
import { fetchWithAccount } from "@/utils/fetch";

const SENDER_THREADS_PAGE_LIMIT = 100;

export async function fetchAllSenderThreads({
  sender,
  labelId,
  emailAccountId,
}: {
  sender: string;
  labelId?: string;
  emailAccountId: string;
}) {
  const threads: GetThreadsResponse["threads"] = [];
  let nextPageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      fromEmail: sender,
      limit: String(SENDER_THREADS_PAGE_LIMIT),
    });

    if (labelId) params.set("labelId", labelId);
    if (nextPageToken) params.set("nextPageToken", nextPageToken);

    const response = await fetchWithAccount({
      url: `/api/threads/basic?${params.toString()}`,
      emailAccountId,
    });

    if (!response.ok) {
      throw new Error("Failed to fetch threads");
    }

    const data: GetThreadsResponse = await response.json();
    threads.push(...data.threads);
    nextPageToken = data.nextPageToken;
  } while (nextPageToken);

  return { threads };
}
