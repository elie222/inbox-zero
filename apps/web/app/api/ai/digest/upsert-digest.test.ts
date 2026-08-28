import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { Prisma } from "@/generated/prisma/client";
import { DigestStatus } from "@/generated/prisma/enums";
import { createTestLogger } from "@/__tests__/helpers";
import { upsertDigest } from "@/app/api/ai/digest/upsert-digest";

vi.mock("@/utils/prisma");

const logger = createTestLogger();

describe("upsertDigest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the pending digest created by a concurrent request when create hits the unique pending digest guard", async () => {
    const duplicateError = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      {
        code: "P2002",
        clientVersion: "test",
      },
    );

    prisma.digest.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: "digest-concurrent",
      createdAt: new Date("2026-05-05T00:00:00.000Z"),
      updatedAt: new Date("2026-05-05T00:00:00.000Z"),
      emailAccountId: "email-account-1",
      sentAt: null,
      status: DigestStatus.PENDING,
      items: [],
    });
    prisma.digest.create.mockRejectedValueOnce(duplicateError);
    prisma.digestItem.upsert.mockResolvedValueOnce({
      id: "item-1",
      createdAt: new Date("2026-05-05T00:00:00.000Z"),
      updatedAt: new Date("2026-05-05T00:00:00.000Z"),
      messageId: "message-1",
      threadId: "thread-1",
      content: JSON.stringify({ content: "Summary" }),
      digestId: "digest-concurrent",
      actionId: "action-1",
      coldEmailId: null,
    });

    await upsertDigest({
      emailAccountId: "email-account-1",
      messageId: "message-1",
      threadId: "thread-1",
      actionId: "action-1",
      content: { content: "Summary" },
      logger,
    });

    expect(prisma.digest.findFirst).toHaveBeenCalledTimes(2);
    expect(prisma.digest.create).toHaveBeenCalledTimes(1);
    expect(prisma.digestItem.upsert).toHaveBeenCalledWith({
      where: {
        digestId_threadId_messageId: {
          digestId: "digest-concurrent",
          threadId: "thread-1",
          messageId: "message-1",
        },
      },
      update: {
        content: JSON.stringify({ content: "Summary" }),
        actionId: "action-1",
      },
      create: {
        messageId: "message-1",
        threadId: "thread-1",
        content: JSON.stringify({ content: "Summary" }),
        digestId: "digest-concurrent",
        actionId: "action-1",
      },
    });
  });
});
