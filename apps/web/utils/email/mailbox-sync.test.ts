import { describe, expect, it } from "vitest";
import { getMockMessage } from "@/__tests__/helpers";
import {
  compactMailboxSyncMessage,
  decodeMailboxSyncCursor,
  encodeMailboxSyncCursor,
  InvalidMailboxSyncCursorError,
} from "@/utils/email/mailbox-sync";

describe("mailbox sync cursor", () => {
  it("round-trips a provider-bound cursor", () => {
    const encoded = encodeMailboxSyncCursor({
      version: 1,
      provider: "google",
      phase: "delta",
      historyId: "12345",
      after: "2026-07-01T00:00:00.000Z",
    });

    expect(decodeMailboxSyncCursor(encoded, "google")).toEqual({
      version: 1,
      provider: "google",
      phase: "delta",
      historyId: "12345",
      after: "2026-07-01T00:00:00.000Z",
    });
    expect(() => decodeMailboxSyncCursor(encoded, "microsoft")).toThrow(
      InvalidMailboxSyncCursorError,
    );
  });

  it("rejects Microsoft cursors that could send credentials off Graph", () => {
    const encoded = encodeMailboxSyncCursor({
      version: 1,
      provider: "microsoft",
      deltaLink:
        "https://attacker.example/v1.0/me/mailFolders/inbox/messages/delta?$deltatoken=secret",
      after: "2026-07-01T00:00:00.000Z",
      snapshot: false,
    });

    expect(() => decodeMailboxSyncCursor(encoded, "microsoft")).toThrow(
      InvalidMailboxSyncCursorError,
    );
  });
});

describe("compactMailboxSyncMessage", () => {
  it("keeps list metadata while removing message bodies and attachments", () => {
    const message = getMockMessage({
      textPlain: "private plain body",
      textHtml: "<p>private html body</p>",
      attachments: [{ filename: "large.pdf" }],
    });

    const compacted = compactMailboxSyncMessage(message);

    expect(compacted).toMatchObject({
      id: "msg1",
      subject: "Test",
      inline: [],
    });
    expect(compacted.attachments).toBeUndefined();
    expect(compacted.textHtml).toBeUndefined();
    expect(compacted.textPlain).toBeUndefined();
  });
});
