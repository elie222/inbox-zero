import type { MetadataChange } from "../src/commands";
import type { ProviderChange } from "../src/sync";

export type ScenarioEvent =
  | {
      kind: "observe";
      change: ProviderChange;
    }
  | {
      kind: "admit";
      operationId: string;
      change: MetadataChange;
      targets: Array<{ accountId: string; messageId: string }>;
    }
  | { kind: "clearPending"; operationId: string }
  | { kind: "restart" };

export const archiveThenNewMailScenario: ScenarioEvent[] = [
  {
    kind: "observe",
    change: {
      kind: "message_patch",
      key: { accountId: "a1", messageId: "m1" },
      reference: {
        provider: "google",
        messageId: "m1",
        conversationId: "c1",
        version: "1",
      },
      fields: {
        subject: "Hello",
        preview: "Hi",
        from: "ada@example.com",
        to: ["me@example.com"],
        receivedAtMs: 1000,
        read: false,
        starred: false,
        roles: ["inbox"],
        labelIds: ["INBOX"],
        categoryIds: [],
        hasAttachments: false,
      },
    },
  },
  {
    kind: "admit",
    operationId: "op-archive",
    change: { kind: "archive" },
    targets: [{ accountId: "a1", messageId: "m1" }],
  },
  {
    kind: "observe",
    change: {
      kind: "message_patch",
      key: { accountId: "a1", messageId: "m1" },
      reference: {
        provider: "google",
        messageId: "m1",
        conversationId: "c1",
        version: "2",
      },
      fields: { roles: [], labelIds: [] },
    },
  },
  { kind: "clearPending", operationId: "op-archive" },
  {
    kind: "observe",
    change: {
      kind: "message_patch",
      key: { accountId: "a1", messageId: "m2" },
      reference: {
        provider: "google",
        messageId: "m2",
        conversationId: "c1",
        version: "1",
      },
      fields: {
        subject: "Hello",
        preview: "New",
        from: "ada@example.com",
        to: ["me@example.com"],
        receivedAtMs: 2000,
        read: false,
        starred: false,
        roles: ["inbox"],
        labelIds: ["INBOX"],
        categoryIds: [],
        hasAttachments: false,
      },
    },
  },
];
