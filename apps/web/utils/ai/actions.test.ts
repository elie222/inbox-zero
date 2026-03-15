import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActionType, DraftReplyConfidence } from "@/generated/prisma/enums";
import { createMockEmailProvider } from "@/utils/__mocks__/email-provider";
import { runActionFunction } from "@/utils/ai/actions";
import {
  resolveDraftAttachments,
  selectDraftAttachmentsForRule,
} from "@/utils/attachments/draft-attachments";
import { createScopedLogger } from "@/utils/logger";
import { getReplyWithConfidence } from "@/utils/redis/reply";
import type { ParsedMessage } from "@/utils/types";
vi.mock("server-only", () => ({}));

vi.mock("@/utils/redis/reply", () => ({
  getReplyWithConfidence: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/utils/attachments/draft-attachments", () => ({
  resolveDraftAttachments: vi.fn().mockResolvedValue([]),
  selectDraftAttachmentsForRule: vi.fn().mockResolvedValue({
    selectedAttachments: [],
    attachmentContext: null,
  }),
}));

describe("runActionFunction", () => {
  const logger = createScopedLogger("test");
  const email = {
    id: "message-1",
    threadId: "thread-1",
    headers: {
      from: "sender@example.com",
      to: "user@example.com",
      subject: "Property documents",
      date: "2026-01-01T12:00:00.000Z",
      "message-id": "<message-1@example.com>",
    },
    textPlain: "Please send the lease packet.",
    textHtml: "<p>Please send the lease packet.</p>",
    snippet: "",
    attachments: [],
    internalDate: "1700000000000",
  } as ParsedMessage;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes resolved drive attachments into draft creation", async () => {
    const client = createMockEmailProvider();

    vi.mocked(getReplyWithConfidence).mockResolvedValue({
      reply: "Attached the requested PDF.",
      confidence: DraftReplyConfidence.HIGH_CONFIDENCE,
      attachments: [
        {
          driveConnectionId: "drive-1",
          fileId: "file-1",
          filename: "lease.pdf",
          mimeType: "application/pdf",
          reason: "Matched the requested property",
        },
      ],
    });
    vi.mocked(resolveDraftAttachments).mockResolvedValue([
      {
        filename: "lease.pdf",
        content: Buffer.from("pdf"),
        contentType: "application/pdf",
      },
    ]);

    await runActionFunction({
      client,
      email,
      action: {
        id: "action-1",
        type: ActionType.DRAFT_EMAIL,
        content: "Attached the requested PDF.",
      },
      userEmail: "user@example.com",
      userId: "user-1",
      emailAccountId: "account-1",
      executedRule: {
        id: "executed-rule-1",
        threadId: "thread-1",
        emailAccountId: "account-1",
        ruleId: "rule-1",
      } as any,
      logger,
    });

    expect(getReplyWithConfidence).toHaveBeenCalledWith({
      emailAccountId: "account-1",
      messageId: "message-1",
      ruleId: "rule-1",
    });

    expect(resolveDraftAttachments).toHaveBeenCalledWith({
      emailAccountId: "account-1",
      userId: "user-1",
      selectedAttachments: [
        {
          driveConnectionId: "drive-1",
          fileId: "file-1",
          filename: "lease.pdf",
          mimeType: "application/pdf",
          reason: "Matched the requested property",
        },
      ],
      logger: expect.anything(),
    });

    expect(client.draftEmail).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        content: "Attached the requested PDF.",
        attachments: [
          expect.objectContaining({
            filename: "lease.pdf",
            contentType: "application/pdf",
          }),
        ],
      }),
      "user@example.com",
      expect.objectContaining({ id: "executed-rule-1" }),
    );
  });

  it("skips draft attachments when the rule cache is missing", async () => {
    const client = createMockEmailProvider();

    vi.mocked(getReplyWithConfidence).mockResolvedValue(null);

    await runActionFunction({
      client,
      email,
      action: {
        id: "action-1",
        type: ActionType.DRAFT_EMAIL,
        content: "Attached the requested PDF.",
      },
      userEmail: "user@example.com",
      userId: "user-1",
      emailAccountId: "account-1",
      executedRule: {
        id: "executed-rule-1",
        threadId: "thread-1",
        emailAccountId: "account-1",
        ruleId: "rule-1",
      } as any,
      logger,
    });

    expect(selectDraftAttachmentsForRule).not.toHaveBeenCalled();
    expect(resolveDraftAttachments).not.toHaveBeenCalled();
  });
});
