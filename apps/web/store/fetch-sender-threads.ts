import type { GetThreadsResponse } from "@/app/api/threads/basic/route";
import { fetchWithAccount } from "@/utils/fetch";
import { EmailProviderRateLimitError } from "@/utils/error";

const SENDER_THREADS_PAGE_LIMIT = 100;

export async function fetchAllSenderThreads({
  sender,
  scope,
  emailAccountId,
}: {
  sender: string;
  // Explicit because providers treat an unfiltered thread query as inbox-only.
  scope: "inbox" | "all";
  emailAccountId: string;
}) {
  const threads: GetThreadsResponse["threads"] = [];
  let nextPageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      fromEmail: sender,
      limit: String(SENDER_THREADS_PAGE_LIMIT),
    });

    if (scope === "inbox") params.set("labelId", "INBOX");
    else params.set("type", "all");
    if (nextPageToken) params.set("nextPageToken", nextPageToken);

    const response = await fetchWithAccount({
      url: `/api/threads/basic?${params.toString()}`,
      emailAccountId,
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new EmailProviderRateLimitError();
      }
      throw new Error("Failed to fetch threads");
    }

    const data: GetThreadsResponse = await response.json();
    threads.push(...data.threads);
    nextPageToken = data.nextPageToken;
  } while (nextPageToken);

  return { threads };
}
