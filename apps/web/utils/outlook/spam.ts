import type { OutlookClient } from "@/utils/outlook/client";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("outlook/spam");

export async function markSpam(client: OutlookClient, threadId: string) {
  // In Outlook, marking as spam is moving to the Junk Email folder
  await client.getClient().api(`/me/messages/${threadId}/move`).post({
    destinationId: "junkemail",
  });
}
