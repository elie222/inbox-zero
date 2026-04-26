import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import {
  DraftReplyConfidence,
  ExecutedRuleStatus,
  GroupItemType,
  SystemType,
} from "@/generated/prisma/enums";
import {
  createTestLogger,
  getEmailAccount,
  getRule,
} from "@/__tests__/helpers";
import { runRules } from "@/utils/ai/choose-rule/run-rules";
import { aiChooseRule } from "@/utils/ai/choose-rule/ai-choose-rule";
import type { RuleWithActions } from "@/utils/types";
import { createGmailTestHarness, type GmailTestHarness } from "./helpers";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({
  after: vi.fn(),
}));
vi.mock("@/utils/ai/choose-rule/ai-choose-rule", () => ({
  aiChooseRule: vi.fn(),
}));
vi.mock("@/utils/cold-email/cold-email-rule", () => ({
  getColdEmailRule: vi.fn().mockResolvedValue(null),
  isColdEmailRuleEnabled: vi.fn().mockReturnValue(false),
}));
vi.mock("@/utils/cold-email/is-cold-email", () => ({
  isColdEmail: vi.fn(),
}));
vi.mock("@/utils/rule/classification-feedback", () => ({
  getClassificationFeedback: vi.fn().mockResolvedValue(null),
}));

const mockGroupFindMany = vi.fn();
const mockExecutedRuleFindMany = vi.fn().mockResolvedValue([]);

vi.mock("@/utils/prisma", () => ({
  default: {
    group: {
      findMany: (...args: unknown[]) => mockGroupFindMany(...args),
    },
    executedRule: {
      findMany: (...args: unknown[]) => mockExecutedRuleFindMany(...args),
    },
  },
}));

const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS;
const TEST_EMAIL = "learned-exclusions@example.com";
const TEST_PORT = 4107;
const TEST_MESSAGE_ID = "msg_learned_exclusion";
const TEST_SENDER = "updates@transactional.getinboxzero.com";

describe.skipIf(!RUN_INTEGRATION_TESTS)(
  "runRules learned exclusions",
  { timeout: 30_000 },
  () => {
    let harness: GmailTestHarness;
    const logger = createTestLogger();

    beforeAll(async () => {
      harness = await createGmailTestHarness({
        port: TEST_PORT,
        email: TEST_EMAIL,
        messages: [
          {
            id: TEST_MESSAGE_ID,
            user_email: TEST_EMAIL,
            from: TEST_SENDER,
            to: TEST_EMAIL,
            subject: "Account update",
            body_text: "Your account status changed.",
            body_html: "<p>Your account status changed.</p>",
            label_ids: ["INBOX", "UNREAD"],
            internal_date: "1711900000000",
          },
        ],
      });
    });

    afterAll(async () => {
      await harness?.emulator.close();
    });

    beforeEach(() => {
      vi.clearAllMocks();
      mockGroupFindMany.mockResolvedValue(buildNotificationGroups());
      mockExecutedRuleFindMany.mockResolvedValue([]);
    });

    test("excludes learned notification rule before AI and surfaces metadata on applied result", async () => {
      const notificationRule = buildNotificationRule();
      const marketingRule = buildMarketingRule();
      const message = await harness.provider.getMessage(TEST_MESSAGE_ID);
      const isReplyInThreadSpy = vi
        .spyOn(harness.provider, "isReplyInThread")
        .mockReturnValue(false);

      vi.mocked(aiChooseRule).mockResolvedValue({
        rules: [{ rule: marketingRule }],
        reason: "Marketing is the remaining eligible rule.",
      });

      const results = await (async () => {
        try {
          return await runRules({
            provider: harness.provider,
            message,
            rules: [notificationRule, marketingRule],
            emailAccount: buildEmailAccount(),
            isTest: true,
            modelType: "default",
            logger,
          });
        } finally {
          isReplyInThreadSpy.mockRestore();
        }
      })();

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe(ExecutedRuleStatus.APPLIED);
      expect(results[0].rule?.id).toBe(marketingRule.id);
      expect(results[0].selectionMetadata).toMatchObject({
        isThread: false,
        remainingAiRuleNames: ["Marketing"],
        learnedPatternExcludedRules: [
          {
            ruleId: notificationRule.id,
            ruleName: notificationRule.name,
            groupId: "group-notification",
            groupName: "Notification",
            itemType: GroupItemType.FROM,
            itemValue: TEST_SENDER,
          },
        ],
      });

      const aiRuleNames = vi
        .mocked(aiChooseRule)
        .mock.calls[0]?.[0].rules.map((rule) => rule.name);
      expect(aiRuleNames).toEqual(["Marketing"]);
    });

    test("returns skipped result with learned exclusion metadata when no remaining AI rule matches", async () => {
      const notificationRule = buildNotificationRule();
      const marketingRule = buildMarketingRule();
      const message = await harness.provider.getMessage(TEST_MESSAGE_ID);
      const isReplyInThreadSpy = vi
        .spyOn(harness.provider, "isReplyInThread")
        .mockReturnValue(false);

      vi.mocked(aiChooseRule).mockResolvedValue({
        rules: [],
        reason: "No remaining rules matched.",
      });

      const results = await (async () => {
        try {
          return await runRules({
            provider: harness.provider,
            message,
            rules: [notificationRule, marketingRule],
            emailAccount: buildEmailAccount(),
            isTest: true,
            modelType: "default",
            logger,
          });
        } finally {
          isReplyInThreadSpy.mockRestore();
        }
      })();

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe(ExecutedRuleStatus.SKIPPED);
      expect(results[0].rule).toBeNull();
      expect(results[0].reason).toBe("No remaining rules matched.");
      expect(results[0].selectionMetadata).toMatchObject({
        isThread: false,
        remainingAiRuleNames: ["Marketing"],
        learnedPatternExcludedRules: [
          {
            ruleId: notificationRule.id,
            ruleName: notificationRule.name,
            groupId: "group-notification",
            groupName: "Notification",
            itemType: GroupItemType.FROM,
            itemValue: TEST_SENDER,
          },
        ],
      });
    });
  },
);

function buildEmailAccount() {
  return {
    ...getEmailAccount({ email: TEST_EMAIL }),
    draftReplyConfidence: DraftReplyConfidence.STANDARD,
  };
}

function buildNotificationRule(): RuleWithActions {
  return {
    ...getRule(
      "Automated account and system notifications",
      [],
      "Notification",
    ),
    id: "rule-notification",
    emailAccountId: "email-account-id",
    groupId: "group-notification",
    runOnThreads: false,
    systemType: SystemType.NOTIFICATION,
  };
}

function buildMarketingRule(): RuleWithActions {
  return {
    ...getRule("Marketing and promotional email", [], "Marketing"),
    id: "rule-marketing",
    emailAccountId: "email-account-id",
    runOnThreads: true,
    systemType: SystemType.MARKETING,
  };
}

function buildNotificationGroups() {
  return [
    {
      id: "group-notification",
      name: "Notification",
      emailAccountId: "email-account-id",
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [
        {
          id: "group-item-exclude-sender",
          groupId: "group-notification",
          type: GroupItemType.FROM,
          value: TEST_SENDER,
          exclude: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          reason: null,
          threadId: null,
          messageId: null,
          source: null,
        },
      ],
      rule: buildNotificationRule(),
    },
  ];
}
