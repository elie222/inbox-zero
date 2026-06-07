import type { gmail_v1 } from "@googleapis/gmail";
import { withGmailRetry } from "@/utils/gmail/retry";
import type { Logger } from "@/utils/logger";

export async function getGmailCurrentHistoryId(
  gmail: gmail_v1.Gmail,
  logger?: Logger,
): Promise<number | null> {
  const response = await withGmailRetry(
    () => gmail.users.getProfile({ userId: "me" }),
    5,
    { logger },
  );

  const historyId = response.data.historyId;
  if (!historyId) return null;

  const parsed = Number.parseInt(historyId, 10);
  return Number.isNaN(parsed) ? null : parsed;
}
