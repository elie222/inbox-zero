import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/utils/prisma", () => ({
  default: {
    emailAccount: {
      findUnique: vi.fn(),
    },
    executedAction: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: vi.fn(),
}));

import prisma from "@/utils/prisma";
import { cleanupAIDraftsForAccount } from "@/utils/ai/draft-cleanup";
import type { Logger } from "@/utils/logger";

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  trace: vi.fn(),
} as unknown as Logger;

describe("cleanupAIDraftsForAccount", () => {
  it("skips database work for scheduled runs when auto cleanup is disabled", async () => {
    vi.mocked(prisma.emailAccount.findUnique).mockResolvedValue({
      aiDraftAutoCleanupEnabled: false,
      aiDraftRetentionDays: 14,
    } as Awaited<ReturnType<typeof prisma.emailAccount.findUnique>>);

    const result = await cleanupAIDraftsForAccount({
      emailAccountId: "acc-1",
      provider: "GOOGLE",
      logger,
      trigger: "scheduled",
    });

    expect(result).toEqual({
      total: 0,
      deleted: 0,
      skippedModified: 0,
      alreadyGone: 0,
      errors: 0,
    });
    expect(prisma.executedAction.findMany).not.toHaveBeenCalled();
  });
});
