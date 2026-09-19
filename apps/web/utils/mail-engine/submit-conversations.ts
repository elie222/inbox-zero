import type { MailClient } from "@inboxzero/mail-core/engine";
import type { MetadataChange } from "@inboxzero/mail-core/commands";
import { randomUuid } from "@/utils/uuid";

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

export async function submitConversationChanges(input: {
  client: MailClient;
  accountId: string;
  conversationIds: string[];
  change: MetadataChange;
}) {
  const accepted: Array<{ conversationId: string; commandId: string }> = [];
  for (const conversationId of input.conversationIds) {
    const result = await submitConversationChange({
      accountId: input.accountId,
      change: input.change,
      client: input.client,
      conversationId,
    });
    if (result.admission.status !== "rejected") {
      accepted.push({
        commandId: result.commandId,
        conversationId,
      });
    }
  }
  return accepted;
}
