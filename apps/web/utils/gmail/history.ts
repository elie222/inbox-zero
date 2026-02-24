import type { gmail_v1 } from "@googleapis/gmail";
import { withGmailRetry } from "@/utils/gmail/retry";
import type { Logger } from "@/utils/logger";

export async function getHistory(
  gmail: gmail_v1.Gmail,
  options: {
    startHistoryId: string;
    historyTypes?: string[];
    maxResults?: number;
  },
  logger?: Logger,
) {
  const history = await withGmailRetry(
    () =>
      gmail.users.history.list({
        userId: "me",
        startHistoryId: options.startHistoryId,
        historyTypes: options.historyTypes,
        maxResults: options.maxResults,
      }),
    5,
    { logger },
  );

  return history.data;
}
