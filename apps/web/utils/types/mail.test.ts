import { describe, expect, it } from "vitest";
import { toMailerAttachments } from "./mail";

describe("toMailerAttachments", () => {
  it("marks composer payloads as base64 and preserves inline MIME metadata", () => {
    expect(
      toMailerAttachments([
        {
          content: "aGVsbG8=",
          contentId: "image@example",
          contentType: "image/png",
          disposition: "inline",
          filename: "image.png",
        },
      ]),
    ).toEqual([
      {
        cid: "image@example",
        content: "aGVsbG8=",
        contentDisposition: "inline",
        contentType: "image/png",
        encoding: "base64",
        filename: "image.png",
      },
    ]);
  });
});
