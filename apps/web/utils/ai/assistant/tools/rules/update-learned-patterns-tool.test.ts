import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";
import { saveLearnedPatterns } from "@/utils/rule/learned-patterns";
import { updateLearnedPatternsTool } from "./update-learned-patterns-tool";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/posthog", () => ({
  posthogCaptureEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/utils/rule/learned-patterns", () => ({
  saveLearnedPatterns: vi.fn(),
}));

const logger = createScopedLogger("update-learned-patterns-tool-test");

describe("updateLearnedPatternsTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a failure when saving learned patterns fails", async () => {
    prisma.rule.findUnique
      .mockResolvedValueOnce({
        id: "rule-1",
        name: "VIP senders",
        updatedAt: new Date("2026-04-12T10:00:00.000Z"),
        emailAccount: {
          rulesRevision: 3,
        },
      } as any)
      .mockResolvedValueOnce({
        id: "rule-1",
        name: "VIP senders",
        updatedAt: new Date("2026-04-12T10:00:00.000Z"),
        emailAccount: {
          rulesRevision: 3,
        },
      } as any);

    vi.mocked(saveLearnedPatterns).mockResolvedValue({
      error: "Failed to update learned patterns",
    });

    const toolInstance = updateLearnedPatternsTool({
      email: "user@example.com",
      emailAccountId: "email-account-1",
      logger,
      getRuleReadState: () => ({
        readAt: Date.now(),
        rulesRevision: 3,
        ruleUpdatedAtByName: new Map([
          ["VIP senders", "2026-04-12T10:00:00.000Z"],
        ]),
      }),
    });

    const result = await toolInstance.execute({
      ruleName: "VIP senders",
      learnedPatterns: [
        {
          include: {
            from: "vip@example.com",
          },
        },
      ],
    });

    expect(result).toEqual({
      success: false,
      error: "Failed to update learned patterns",
    });
  });
});
