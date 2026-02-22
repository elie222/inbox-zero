import type { gmail_v1 } from "@googleapis/gmail";
import { withGmailRetry } from "@/utils/gmail/retry";

export async function getHistory(
  gmail: gmail_v1.Gmail,
  options: {
    startHistoryId: string;
    historyTypes?: string[];
    maxResults?: number;
    pageToken?: string;
  },
) {
  const history = await withGmailRetry(() =>
    gmail.users.history.list({
      userId: "me",
      startHistoryId: options.startHistoryId,
      historyTypes: options.historyTypes,
      maxResults: options.maxResults,
      pageToken: options.pageToken,
    }),
  );

  return history.data;
}
