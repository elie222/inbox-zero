import { describe, expect, it } from "vitest";
import { attachmentMetadata } from "@/utils/task-inbound";
import type { ParsedMessage } from "@/utils/types";

describe("attachmentMetadata", () => {
  it("caches only the fields the task UI needs", () => {
    const message = {
      attachments: [
        {
          attachmentId: "att-1",
          filename: "quote.pdf",
          mimeType: "application/pdf",
          size: 52_000,
          headers: {},
        },
      ],
    } as unknown as Pick<ParsedMessage, "attachments">;

    expect(attachmentMetadata(message)).toEqual([
      {
        attachmentId: "att-1",
        filename: "quote.pdf",
        mimeType: "application/pdf",
        size: 52_000,
      },
    ]);
  });

  it("drops inline blobs without an id or filename and handles none", () => {
    const message = {
      attachments: [
        {
          attachmentId: "",
          filename: "inline-logo",
          mimeType: "image/png",
          size: 100,
          headers: {},
        },
        {
          attachmentId: "att-2",
          filename: "",
          mimeType: "image/png",
          size: 100,
          headers: {},
        },
      ],
    } as unknown as Pick<ParsedMessage, "attachments">;

    expect(attachmentMetadata(message)).toEqual([]);
    expect(attachmentMetadata({ attachments: undefined })).toEqual([]);
  });
});
