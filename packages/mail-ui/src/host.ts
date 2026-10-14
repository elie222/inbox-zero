import type { MessageKey } from "@inboxzero/mail-core/identities";

export type MailUiHost = {
  openSettings(): void;
  loadAttachment?: (
    input: MessageKey & { attachmentId: string },
  ) => Promise<Blob>;
  openAccount?(accountId: string): void;
  compose?: () => void;
};
