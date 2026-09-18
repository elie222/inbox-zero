import { describe, expect, it } from "vitest";
import {
  applyMetadataChange,
  deriveEffectiveMessage,
  type ConfirmedMessage,
} from "./effective-state";

const confirmed: ConfirmedMessage = {
  accountId: "a1",
  messageId: "m1",
  conversationId: "c1",
  subject: "Hello",
  preview: "World",
  from: "ada@example.com",
  to: ["me@example.com"],
  cc: [],
  receivedAtMs: 1,
  read: false,
  starred: false,
  folderId: "inbox",
  labelIds: ["INBOX"],
  categoryIds: [],
  roles: ["inbox"],
  hasAttachments: false,
  version: "1",
  deleted: false,
};

describe("applyMetadataChange", () => {
  it("removes inbox on archive and restores it on unarchive", () => {
    const archived = applyMetadataChange(confirmed, { kind: "archive" });
    expect(archived.roles).toEqual([]);
    const restored = applyMetadataChange(archived, { kind: "unarchive" });
    expect(restored.roles).toEqual(["inbox"]);
  });

  it("applies read, star, trash, and spam changes", () => {
    expect(
      applyMetadataChange(confirmed, { kind: "set_read", read: true }).read,
    ).toBe(true);
    expect(
      applyMetadataChange(confirmed, { kind: "set_starred", starred: true })
        .starred,
    ).toBe(true);
    expect(applyMetadataChange(confirmed, { kind: "trash" }).roles).toEqual([
      "trash",
    ]);
    expect(
      applyMetadataChange(confirmed, { kind: "set_spam", spam: true }).roles,
    ).toEqual(["spam"]);
  });
});

describe("deriveEffectiveMessage", () => {
  it("applies pending archive without mutating confirmed facts used as input", () => {
    const effective = deriveEffectiveMessage(confirmed, [
      {
        operationId: "op1",
        change: { kind: "archive" },
        targets: [{ accountId: "a1", messageId: "m1" }],
      },
    ]);
    expect(effective.roles).toEqual([]);
    expect(effective.pendingOperationIds).toEqual(["op1"]);
    expect(confirmed.roles).toEqual(["inbox"]);
  });

  it("ignores pending effects after the message is deleted", () => {
    const effective = deriveEffectiveMessage({ ...confirmed, deleted: true }, [
      {
        operationId: "op1",
        change: { kind: "unarchive" },
        targets: [{ accountId: "a1", messageId: "m1" }],
      },
    ]);
    expect(effective.pendingOperationIds).toEqual([]);
  });
});
