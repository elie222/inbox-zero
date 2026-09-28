import chunk from "lodash/chunk";
import type { MailClient } from "@inboxzero/mail-core/engine";
import type { MetadataChange } from "@inboxzero/mail-core/commands";
import { randomUuid } from "@/utils/uuid";

const MAX_CONVERSATIONS_PER_COMMAND = 500;

export async function submitConversationChange(input: {
  client: MailClient;
  accountId: string;
  conversationId: string;
  change: MetadataChange;
  commandId?: string;
}) {
  const diagnostics = await input.client.getDiagnostics(input.accountId);
  const commandId = input.commandId ?? randomUuid();
  const admission = await input.client.submitConversations({
    accountId: input.accountId,
    commandId,
    conversations: [
      {
        accountId: input.accountId,
        conversationId: input.conversationId,
      },
    ],
    change: input.change,
    observedRevision: diagnostics.revision,
  });
  return { admission, commandId };
}

// One command per batch lets the engine apply the whole selection in a single
// view refresh and lets the server make one bulk provider call.
export async function submitConversationChanges(input: {
  client: MailClient;
  accountId: string;
  conversationIds: string[];
  change: MetadataChange;
}) {
  const accepted: Array<{ conversationId: string; commandId: string }> = [];
  const rejectionCodes: string[] = [];
  const conversationIds = [...new Set(input.conversationIds)];
  if (!conversationIds.length) return { accepted, rejectionCodes };

  const diagnostics = await input.client.getDiagnostics(input.accountId);
  // The server's snooze scheduler tracks one thread per operation.
  const batchSize =
    input.change.kind === "snooze" ? 1 : MAX_CONVERSATIONS_PER_COMMAND;
  for (const batch of chunk(conversationIds, batchSize)) {
    const commandId = randomUuid();
    const admission = await input.client.submitConversations({
      accountId: input.accountId,
      commandId,
      conversations: batch.map((conversationId) => ({
        accountId: input.accountId,
        conversationId,
      })),
      change: input.change,
      observedRevision: diagnostics.revision,
    });
    if (admission.status === "rejected") {
      rejectionCodes.push(admission.code);
      continue;
    }
    for (const conversationId of batch) {
      accepted.push({ conversationId, commandId });
    }
  }
  return { accepted, rejectionCodes };
}
