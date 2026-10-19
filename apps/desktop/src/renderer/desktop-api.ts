import type { MessageKey } from "@inboxzero/mail-core/identities";
import type { MailIpcSnapshotEvent } from "@inboxzero/mail-core/protocol/mail-ipc-client";

export type InboxZeroDesktopApi = {
  readAttachment: (
    input: MessageKey & { attachmentId: string },
  ) => Promise<Uint8Array<ArrayBuffer>>;
  mailEngine: (payload: unknown) => Promise<unknown>;
  mailEngineSubscribe: (input: unknown) => Promise<unknown>;
  mailEngineUnsubscribe: (subscriptionId: string) => Promise<unknown>;
  onMailEngineSnapshot: (
    listener: (event: MailIpcSnapshotEvent) => void,
  ) => () => void;
  wipeMailbox: () => Promise<unknown>;
  openWindow?: (path: string) => Promise<unknown>;
};
