import type { EmailProvider } from "@/utils/email/types";
import type { ParsedMessage } from "@/utils/types";

export class AutomaticFilingDeferredError extends Error {
  constructor() {
    super("Automatic filing deferred");
    this.name = "AutomaticFilingDeferredError";
  }
}

export function isReadyForFiling(message: Pick<ParsedMessage, "labelIds">) {
  return Boolean(
    message.labelIds?.includes("INBOX") &&
      !message.labelIds.includes("UNREAD") &&
      !message.labelIds.includes("STARRED"),
  );
}

export function createFilingGuard(provider: EmailProvider, messageId: string) {
  return async () => {
    const message = await provider.getMessage(messageId);
    if (!isReadyForFiling(message)) throw new AutomaticFilingDeferredError();
    // Archive actions operate on a thread, so protect its other unread/flagged mail too.
    const thread = await provider.getThread(message.threadId);
    if (
      thread.messages.some(
        (item) => item.labelIds?.includes("INBOX") && !isReadyForFiling(item),
      )
    )
      throw new AutomaticFilingDeferredError();
  };
}
