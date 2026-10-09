import { describe, expect, it } from "vitest";
import type { DraftAttachment } from "@/utils/email/types";
import {
  type ComposeAttachment,
  mergeDraftAttachments,
  toAttachmentReference,
} from "./compose-attachments";

describe("toAttachmentReference", () => {
  it("keeps only a reference to files already on the mailbox draft", () => {
    const stored = [
      attachment({
        id: "photo",
        status: "uploaded",
        draftAttachmentId: "graph-1",
        previewUrl: "blob:preview",
        managed: true,
        disposition: "inline",
        contentId: "photo@inboxzero.local",
      }),
      attachment({ id: "uploading", status: "uploading" }),
      attachment({ id: "failed", status: "failed", error: "Too large" }),
    ].flatMap(toAttachmentReference);

    expect(stored).toEqual([
      {
        id: "photo",
        filename: "photo.png",
        mimeType: "image/png",
        size: 10,
        disposition: "inline",
        contentId: "photo@inboxzero.local",
        draftAttachmentId: "graph-1",
      },
    ]);
    expect(JSON.stringify(stored)).not.toMatch(/blob:|contentBase64/);
  });
});

describe("mergeDraftAttachments", () => {
  it("keeps the local id of a file Outlook gave its own id", () => {
    const merged = mergeDraftAttachments(
      [
        attachment({
          id: "local-1",
          status: "uploaded",
          draftAttachmentId: "graph-1",
        }),
      ],
      [listed({ id: "graph-1" })],
    );
    expect(merged).toEqual([
      expect.objectContaining({
        id: "local-1",
        draftAttachmentId: "graph-1",
        status: "uploaded",
      }),
    ]);
  });

  it("adds files the draft carries that the composer didn't attach", () => {
    const merged = mergeDraftAttachments(
      [],
      [listed({ id: "forwarded", filename: "report.pdf" })],
    );
    expect(merged).toEqual([
      expect.objectContaining({
        id: "forwarded",
        filename: "report.pdf",
        status: "uploaded",
      }),
    ]);
  });

  it("keeps files still uploading and drops ones no longer on the draft", () => {
    const merged = mergeDraftAttachments(
      [
        attachment({
          id: "gone",
          status: "uploaded",
          draftAttachmentId: "gone",
        }),
        attachment({ id: "pending", status: "uploading" }),
      ],
      [],
    );
    expect(merged.map((item) => item.id)).toEqual(["pending"]);
  });

  it("keeps an inline image's preview when Gmail renumbers it", () => {
    const merged = mergeDraftAttachments(
      [
        attachment({
          id: "photo",
          status: "uploaded",
          draftAttachmentId: "old-gmail-id",
          disposition: "inline",
          contentId: "photo@inboxzero.local",
          previewUrl: "blob:preview",
          managed: true,
        }),
      ],
      [
        listed({
          id: "new-id",
          disposition: "inline",
          contentId: "photo@inboxzero.local",
        }),
      ],
    );
    expect(merged).toEqual([
      expect.objectContaining({
        id: "photo",
        draftAttachmentId: "new-id",
        previewUrl: "blob:preview",
        managed: true,
      }),
    ]);
  });
});

function attachment(overrides: Partial<ComposeAttachment>): ComposeAttachment {
  return {
    id: "file",
    filename: "photo.png",
    mimeType: "image/png",
    size: 10,
    disposition: "attachment",
    status: "uploaded",
    ...overrides,
  };
}

function listed(overrides: Partial<DraftAttachment>): DraftAttachment {
  return {
    id: "file",
    filename: "photo.png",
    mimeType: "image/png",
    size: 10,
    disposition: "attachment",
    messageId: "message-1",
    providerAttachmentId: "provider-file",
    ...overrides,
  };
}
