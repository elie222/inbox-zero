import { describe, expect, it, vi } from "vitest";
import type { EmailProvider } from "@/utils/email/types";
import {
  getDeliveryAttachment,
  MAX_DELIVERY_ATTACHMENT_BYTES,
} from "./attachment-delivery";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/email/provider");

describe("attachment delivery", () => {
  it("uses mailbox metadata instead of caller-supplied file details", async () => {
    const provider = {
      getMessage: vi.fn().mockResolvedValue({
        id: "message",
        attachments: [
          {
            attachmentId: "file",
            filename: "report.pdf",
            mimeType: "application/pdf",
            size: 100,
          },
        ],
      }),
    } as unknown as EmailProvider;
    await expect(
      getDeliveryAttachment(provider, "message", "file"),
    ).resolves.toEqual({
      messageId: "message",
      attachmentId: "file",
      filename: "report.pdf",
      mimeType: "application/pdf",
      size: 100,
    });
  });

  it("rejects attachments not present in the selected message", async () => {
    const provider = {
      getMessage: vi.fn().mockResolvedValue({ id: "message", attachments: [] }),
    } as unknown as EmailProvider;
    await expect(
      getDeliveryAttachment(provider, "message", "foreign-file"),
    ).rejects.toThrow("Attachment not found");
  });

  it("rejects files over the delivery limit before downloading", async () => {
    const provider = {
      getMessage: vi.fn().mockResolvedValue({
        id: "message",
        attachments: [
          { attachmentId: "large", size: MAX_DELIVERY_ATTACHMENT_BYTES + 1 },
        ],
      }),
    } as unknown as EmailProvider;
    await expect(
      getDeliveryAttachment(provider, "message", "large"),
    ).rejects.toThrow("20 MB");
  });
});
