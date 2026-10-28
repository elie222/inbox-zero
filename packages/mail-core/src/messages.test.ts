import { describe, expect, it } from "vitest";
import { attachmentContentQuerySchema } from "./protocol/mail-http";
import {
  MAX_ATTACHMENT_ID_LENGTH,
  messageAttachmentDescriptorSchema,
} from "./messages";

describe("message attachment descriptors", () => {
  it("accepts every attachment id the attachment download route accepts", () => {
    const attachmentId = "a".repeat(MAX_ATTACHMENT_ID_LENGTH);

    expect(
      attachmentContentQuerySchema.safeParse({
        messageId: "message-1",
        attachmentId,
      }).success,
    ).toBe(true);
    expect(
      messageAttachmentDescriptorSchema.safeParse({
        attachmentId,
        filename: "report.pdf",
        mimeType: "application/pdf",
        size: 1024,
        inline: false,
      }).success,
    ).toBe(true);
  });
});
