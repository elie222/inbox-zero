import { beforeEach, describe, expect, it, vi } from "vitest";
import { EmailSendOperationStatus } from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";
import { MAIL_MUTATION_RETRY_WINDOW_MS } from "@/utils/email-cache/policy";
import { deleteExpiredEmailSendOperations } from "./email-send-operation-retention";

vi.mock("@/utils/prisma");

describe("deleteExpiredEmailSendOperations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes only terminal operations outside the retry window", async () => {
    prisma.emailSendOperation.deleteMany.mockResolvedValue({ count: 3 });
    const now = new Date("2026-08-25T12:00:00.000Z");

    const deleted = await deleteExpiredEmailSendOperations(now);

    expect(deleted).toBe(3);
    expect(prisma.emailSendOperation.deleteMany).toHaveBeenCalledWith({
      where: {
        status: {
          in: [
            EmailSendOperationStatus.SENT,
            EmailSendOperationStatus.UNCERTAIN,
          ],
        },
        updatedAt: {
          lt: new Date(now.getTime() - MAIL_MUTATION_RETRY_WINDOW_MS),
        },
      },
    });
  });
});
