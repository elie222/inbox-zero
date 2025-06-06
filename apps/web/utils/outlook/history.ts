import type { gmail_v1 } from "@googleapis/gmail";

export async function getHistory(
  gmail: gmail_v1.Gmail,
  options: {
    startHistoryId: string;
    historyTypes?: string[];
    maxResults?: number;
  },
) {
  const history = await gmail.users.history.list({
    userId: "me",
    startHistoryId: options.startHistoryId,
    historyTypes: options.historyTypes,
    maxResults: options.maxResults,
  });

  return history.data;
}
