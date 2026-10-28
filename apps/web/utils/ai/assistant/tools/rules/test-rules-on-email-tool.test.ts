import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createTestLogger, getMockMessage } from "@/__tests__/helpers";
import { ActionType, ExecutedRuleStatus } from "@/generated/prisma/enums";
import { runRules } from "@/utils/ai/choose-rule/run-rules";
import { testRulesOnEmailTool } from "./test-rules-on-email-tool";

vi.mock("@/utils/prisma");
vi.mock("@/utils/posthog", () => ({
  posthogCaptureEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/utils/ai/choose-rule/run-rules", () => ({
  runRules: vi.fn(),
}));
vi.mock("@/utils/user/get", () => ({
  getEmailAccountForRuleExecution: vi.fn().mockResolvedValue({
    id: "email-account-1",
  }),
}));
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: vi.fn().mockResolvedValue({
    getMessage: vi.fn().mockResolvedValue(getMockMessage({ id: "msg-1" })),
  }),
}));

const logger = createTestLogger();

describe("testRulesOnEmailTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.rule.findMany.mockResolvedValue([]);
  });

  it("dry-runs the rules and reports a learned pattern that forced the match", async () => {
    vi.mocked(runRules).mockResolvedValue([
      {
        rule: { name: "Notification" } as any,
        actionItems: [
          {
            id: "action-1",
            type: ActionType.LABEL,
            label: "Notification",
            content: "should not be returned",
          },
        ],
        reason: "Matched learned pattern",
        status: ExecutedRuleStatus.APPLIED,
        matchReasons: [
          {
            type: "LEARNED_PATTERN",
            group: { id: "group-1", name: "Notification" },
            groupItem: {
              id: "item-1",
              type: "FROM",
              value: "noreply@example.com",
              exclude: false,
            },
          } as any,
        ],
        createdAt: new Date(),
      },
    ]);

    const result = await testRulesOnEmailTool({
      email: "user@example.com",
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    }).execute!({ messageId: "msg-1" }, {} as any);

    expect(runRules).toHaveBeenCalledWith(
      expect.objectContaining({ isTest: true, skipDraftReplies: true }),
    );
    expect(result).toMatchObject({
      messageId: "msg-1",
      matchedRules: [
        {
          ruleName: "Notification",
          matchMetadata: [
            {
              type: "LEARNED_PATTERN",
              groupItem: { value: "noreply@example.com", exclude: false },
            },
          ],
          actions: [
            { type: ActionType.LABEL, label: "Notification", folderName: null },
          ],
        },
      ],
      noMatchReason: null,
    });
  });

  it("explains when no rule would match", async () => {
    vi.mocked(runRules).mockResolvedValue([
      {
        rule: null,
        reason: "No rules matched",
        status: ExecutedRuleStatus.SKIPPED,
        createdAt: new Date(),
      },
    ]);

    const result = await testRulesOnEmailTool({
      email: "user@example.com",
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    }).execute!({ messageId: "msg-1" }, {} as any);

    expect(result).toMatchObject({
      matchedRules: [],
      noMatchReason: "No rules matched",
    });
  });
});
