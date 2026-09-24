import type { MailIpcSnapshotEvent } from "@inboxzero/mail-core/protocol/mail-ipc-client";

export type InboxZeroDesktopApi = {
  mailEngine: (payload: unknown) => Promise<unknown>;
  mailEngineSubscribe: (input: unknown) => Promise<unknown>;
  mailEngineUnsubscribe: (subscriptionId: string) => Promise<unknown>;
  onMailEngineSnapshot: (
    listener: (event: MailIpcSnapshotEvent) => void,
  ) => () => void;
  wipeMailbox: () => Promise<unknown>;
  openWindow?: (path: string) => Promise<unknown>;
};
