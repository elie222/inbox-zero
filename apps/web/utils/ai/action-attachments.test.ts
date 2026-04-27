import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AttachmentSourceType,
  DraftReplyConfidence,
} from "@/generated/prisma/enums";
import { resolveActionAttachments } from "@/utils/ai/action-attachments";
import { resolveDraftAttachments } from "@/utils/attachments/draft-attachments";
import { getReplyWithConfidence } from "@/utils/redis/reply";
import prisma from "@/utils/__mocks__/prisma";
import { createTestLogger } from "@/__tests__/helpers";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/redis/reply", () => ({
  getReplyWithConfidence: vi.fn(),
}));
vi.mock("@/utils/attachments/draft-attachments", () => ({
  resolveDraftAttachments: vi.fn(),
}));

const logger = createTestLogger();

const emailAccount = { id: "acct-1", userId: "user-1", email: "u@example.com" };

const email = {
  id: "msg-1",
  threadId: "th-1",
  headers: {
    from: "a@b.com",
    to: "u@example.com",
    subject: "Hi",
    date: "2026-01-01T00:00:00.000Z",
    "message-id": "<msg-1>",
  },
  textPlain: "x",
  textHtml: null,
  snippet: "",
  attachments: [],
  internalDate: "1",
} as const;

const executedRule = { ruleId: "rule-1" } as const;

describe("resolveActionAttachments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveDraftAttachments).mockResolvedValue([
      { filename: "a.pdf", content: Buffer.from("x"), contentType: "application/pdf" },
    ]);
    vi.mocked(prisma.attachmentSource.findFirst).mockResolvedValue({
      id: "as-1",
    } as any);
    vi.mocked(getReplyWithConfidence).mockResolvedValue(null);
  });

  it("returns early without hitting Prisma when there are no static attachments and AI selection is disabled", async () => {
    const result = await resolveActionAttachments({
      email: email as any,
      emailAccount,
      executedRule: executedRule as any,
      logger,
      staticAttachments: [],
      includeAiSelectedAttachments: false,
    });

    expect(result).toEqual([]);
    expect(prisma.attachmentSource.findFirst).not.toHaveBeenCalled();
    expect(resolveDraftAttachments).not.toHaveBeenCalled();
  });

  it("returns early when AI selection is on but the executed rule has no ruleId", async () => {
    const result = await resolveActionAttachments({
      email: email as any,
      emailAccount,
      executedRule: { ruleId: null } as any,
      logger,
      staticAttachments: null,
      includeAiSelectedAttachments: true,
    });

    expect(result).toEqual([]);
    expect(prisma.attachmentSource.findFirst).not.toHaveBeenCalled();
  });

  it("dedupes static and draft-selected attachments by drive connection and file id before resolving", async () => {
    vi.mocked(getReplyWithConfidence).mockResolvedValue({
      reply: "r",
      confidence: DraftReplyConfidence.HIGH_CONFIDENCE,
      attachments: [
        {
          driveConnectionId: "d1",
          fileId: "f1",
          filename: "from-cache.pdf",
          mimeType: "application/pdf",
        },
      ],
    });

    await resolveActionAttachments({
      email: email as any,
      emailAccount,
      executedRule: executedRule as any,
      logger,
      staticAttachments: [
        {
          driveConnectionId: "d1",
          name: "static.pdf",
          sourceId: "f1",
          type: AttachmentSourceType.FILE,
        },
      ],
      includeAiSelectedAttachments: true,
    });

    expect(resolveDraftAttachments).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedAttachments: expect.arrayContaining([
          expect.objectContaining({
            driveConnectionId: "d1",
            fileId: "f1",
          }),
        ]),
      }),
    );
    expect(vi.mocked(resolveDraftAttachments).mock.calls[0]?.[0].selectedAttachments).toHaveLength(
      1,
    );
  });

  it("skips resolveDraftAttachments when the draft cache is empty and there are no static attachments", async () => {
    vi.mocked(getReplyWithConfidence).mockResolvedValue(null);

    const result = await resolveActionAttachments({
      email: email as any,
      emailAccount,
      executedRule: executedRule as any,
      logger,
      staticAttachments: null,
      includeAiSelectedAttachments: true,
    });

    expect(result).toEqual([]);
    expect(resolveDraftAttachments).not.toHaveBeenCalled();
  });

  it("ignores non-FILE static attachment rows", async () => {
    await resolveActionAttachments({
      email: email as any,
      emailAccount,
      executedRule: executedRule as any,
      logger,
      staticAttachments: [
        {
          driveConnectionId: "d1",
          name: "folder",
          sourceId: "folder-1",
          type: AttachmentSourceType.FOLDER,
        },
      ],
      includeAiSelectedAttachments: false,
    });

    expect(resolveDraftAttachments).not.toHaveBeenCalled();
  });
});
