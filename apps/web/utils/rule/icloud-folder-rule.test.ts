import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { ActionType } from "@/generated/prisma/enums";
import { createTestLogger } from "@/__tests__/helpers";
import { createRule } from "./rule";

vi.mock("@/utils/prisma");
vi.mock("@/utils/email/provider", () => ({ createEmailProvider: vi.fn() }));
vi.mock("@/utils/rule/rule-history", () => ({
  createRuleHistory: vi.fn(),
  ruleHistoryRuleInclude: { actions: true, group: true },
}));

const logger = createTestLogger();
const EMAIL_ACCOUNT_ID = "email-account-id";
const RULE_ID = "rule-id";
type RuleAction = Parameters<typeof createRule>[0]["result"]["actions"][number];

describe("iCloud folder rules", () => {
  beforeEach(() => vi.clearAllMocks());

  it("preserves a selected iCloud destination when saving a rule", async () => {
    prisma.rule.create.mockResolvedValue({
      id: RULE_ID,
      actions: [],
      group: null,
    } as never);
    await createRule({
      result: {
        name: "Newsletter",
        condition: {
          aiInstructions: "File routine newsletters",
          conditionalOperator: null,
          static: null,
        },
        actions: [
          {
            type: ActionType.MOVE_FOLDER,
            fields: { folderName: "Inbox Zero/Newsletters" },
            folderId: "imap:SW5ib3ggWmVyby9OZXdzbGV0dGVycw",
            delayInMinutes: null,
          } as RuleAction,
        ],
      },
      emailAccountId: EMAIL_ACCOUNT_ID,
      provider: "icloud",
      runOnThreads: false,
      logger,
    });
    expect(prisma.rule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actions: {
            createMany: {
              data: [
                expect.objectContaining({
                  type: ActionType.MOVE_FOLDER,
                  folderName: "Inbox Zero/Newsletters",
                  folderId: "imap:SW5ib3ggWmVyby9OZXdzbGV0dGVycw",
                }),
              ],
            },
          },
        }),
      }),
    );
  });
});
