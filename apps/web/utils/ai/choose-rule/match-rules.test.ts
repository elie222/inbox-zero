import { describe, it, expect, vi, beforeEach } from "vitest";
import { filterMultipleSystemRules } from "./match-rules";
import {
  findMatchingRules,
  matchesStaticRule,
  filterConversationStatusRules,
  evaluateRuleConditions,
} from "./match-rules";
import {
  type GroupItem,
  GroupItemType,
  LogicalOperator,
  type Prisma,
  SystemType,
} from "@prisma/client";
import type {
  RuleWithActions,
  ParsedMessage,
  ParsedMessageHeaders,
} from "@/utils/types";
import type { EmailProvider } from "@/utils/email/types";
import prisma from "@/utils/__mocks__/prisma";
import { aiChooseRule } from "@/utils/ai/choose-rule/ai-choose-rule";
import { getEmailAccount } from "@/__tests__/helpers";
import { ConditionType } from "@/utils/config";
import {
  getColdEmailRule,
  isColdEmailRuleEnabled,
} from "@/utils/cold-email/cold-email-rule";
import { isColdEmail } from "@/utils/cold-email/is-cold-email";

// Run with:
// pnpm test match-rules.test.ts

const provider = {
  isReplyInThread: vi.fn().mockReturnValue(false),
} as unknown as EmailProvider;

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/ai/choose-rule/ai-choose-rule", () => ({
  aiChooseRule: vi.fn(),
}));
vi.mock("@/utils/reply-tracker/check-sender-reply-history", () => ({
  checkSenderReplyHistory: vi.fn(),
}));
vi.mock("@/utils/cold-email/cold-email-rule", () => ({
  getColdEmailRule: vi.fn(),
  isColdEmailRuleEnabled: vi.fn(),
}));
vi.mock("@/utils/cold-email/is-cold-email", () => ({
  isColdEmail: vi.fn(),
}));

describe("matchesStaticRule", () => {
  it("should match wildcard pattern at start of email", () => {
    const rule = getStaticRule({ from: "*@gmail.com" });
    const message = getMessage({
      headers: getHeaders({ from: "test@gmail.com" }),
    });

    expect(matchesStaticRule(rule, message)).toBe(true);
  });

  it("should not match when wildcard pattern doesn't match domain", () => {
    const rule = getStaticRule({ from: "*@gmail.com" });
    const message = getMessage({
      headers: getHeaders({ from: "test@yahoo.com" }),
    });

    expect(matchesStaticRule(rule, message)).toBe(false);
  });

  it("should handle multiple wildcards in pattern", () => {
    const rule = getStaticRule({ subject: "*important*" });
    const message = getMessage({
      headers: getHeaders({ subject: "This is important message" }),
    });

    expect(matchesStaticRule(rule, message)).toBe(true);
  });

  it("should handle invalid regex patterns gracefully", () => {
    const rule = getStaticRule({ from: "[invalid(regex" });
    const message = getMessage({
      headers: getHeaders({ from: "test@example.com" }),
    });

    expect(matchesStaticRule(rule, message)).toBe(false);
  });

  it("should return false when no conditions are provided", () => {
    const rule = getStaticRule({});
    const message = getMessage({
      headers: getHeaders({ from: "test@example.com" }),
    });

    expect(matchesStaticRule(rule, message)).toBe(false);
  });

  it("should match body content with wildcard", () => {
    const rule = getStaticRule({ body: "*unsubscribe*" });
    const message = getMessage({
      headers: getHeaders(),
      textPlain: "Click here to unsubscribe from our newsletter",
    });

    expect(matchesStaticRule(rule, message)).toBe(true);
  });

  it("should match @domain.com", () => {
    const rule = getStaticRule({ from: "@domain.com" });
    const message = getMessage({
      headers: getHeaders({ from: "test@domain.com" }),
    });

    expect(matchesStaticRule(rule, message)).toBe(true);
  });

  it("should match Creator Message subject pattern", () => {
    const rule = getStaticRule({ subject: "[Creator Message]*" });
    const message = getMessage({
      headers: getHeaders({
        subject: "[Creator Message] Contact - new submission",
      }),
    });

    expect(matchesStaticRule(rule, message)).toBe(true);
  });

  it("should match exact Creator Message subject", () => {
    const rule = getStaticRule({
      subject: "[Creator Message] Contact - new submission",
    });
    const message = getMessage({
      headers: getHeaders({
        subject: "[Creator Message] Contact - new submission",
      }),
    });

    expect(matchesStaticRule(rule, message)).toBe(true);
  });

  it("should match parentheses in subject", () => {
    const rule = getStaticRule({ subject: "Invoice (PDF)" });
    const message = getMessage({
      headers: getHeaders({ subject: "Invoice (PDF)" }),
    });

    expect(matchesStaticRule(rule, message)).toBe(true);
  });

  it("should match plus sign in email address", () => {
    const rule = getStaticRule({ from: "user+tag@gmail.com" });
    const message = getMessage({
      headers: getHeaders({ from: "user+tag@gmail.com" }),
    });

    expect(matchesStaticRule(rule, message)).toBe(true);
  });

  it("should match dots in subject", () => {
    const rule = getStaticRule({ subject: "Order #123.456" });
    const message = getMessage({
      headers: getHeaders({ subject: "Order #123.456" }),
    });

    expect(matchesStaticRule(rule, message)).toBe(true);
  });

  it("should match dollar signs in subject", () => {
    const rule = getStaticRule({ subject: "Payment $100" });
    const message = getMessage({
      headers: getHeaders({ subject: "Payment $100" }),
    });

    expect(matchesStaticRule(rule, message)).toBe(true);
  });

  it("should match curly braces in subject", () => {
    const rule = getStaticRule({ subject: "Template {name}" });
    const message = getMessage({
      headers: getHeaders({ subject: "Template {name}" }),
    });

    expect(matchesStaticRule(rule, message)).toBe(true);
  });

  it("should match pipe symbol in subject", () => {
    const rule = getStaticRule({ subject: "Alert | System" });
    const message = getMessage({
      headers: getHeaders({ subject: "Alert | System" }),
    });

    expect(matchesStaticRule(rule, message)).toBe(true);
  });

  it("should match question mark in subject", () => {
    const rule = getStaticRule({ subject: "Are you ready?" });
    const message = getMessage({
      headers: getHeaders({ subject: "Are you ready?" }),
    });

    expect(matchesStaticRule(rule, message)).toBe(true);
  });

  it("should match caret symbol in subject", () => {
    const rule = getStaticRule({ subject: "Version ^1.0" });
    const message = getMessage({
      headers: getHeaders({ subject: "Version ^1.0" }),
    });

    expect(matchesStaticRule(rule, message)).toBe(true);
  });

  it("should match wildcards with special characters", () => {
    const rule = getStaticRule({ subject: "*[Important]*" });
    const message = getMessage({
      headers: getHeaders({ subject: "URGENT [Important] Notice" }),
    });

    expect(matchesStaticRule(rule, message)).toBe(true);
  });

  it("should match common notification patterns", () => {
    const rule = getStaticRule({ from: "*notification*@*" });
    const message = getMessage({
      headers: getHeaders({ from: "noreply-notification@company.com" }),
    });

    expect(matchesStaticRule(rule, message)).toBe(true);
  });

  it("should match receipt patterns", () => {
    const rule = getStaticRule({ subject: "*receipt*" });
    const message = getMessage({
      headers: getHeaders({ subject: "Your receipt from store" }),
    });

    expect(matchesStaticRule(rule, message)).toBe(true);
  });

  it("should be case sensitive", () => {
    const rule = getStaticRule({ subject: "URGENT" });
    const message = getMessage({
      headers: getHeaders({ subject: "urgent" }),
    });

    expect(matchesStaticRule(rule, message)).toBe(false);
  });

  it("should handle empty header values gracefully", () => {
    const rule = getStaticRule({ from: "test@example.com" });
    const message = getMessage({
      headers: getHeaders({ from: "" }),
    });

    expect(matchesStaticRule(rule, message)).toBe(false);
  });

  it("should match backslash characters", () => {
    const rule = getStaticRule({ subject: "Path: C:\\Users\\Name" });
    const message = getMessage({
      headers: getHeaders({ subject: "Path: C:\\Users\\Name" }),
    });

    expect(matchesStaticRule(rule, message)).toBe(true);
  });

  it("should match multiple domains separated by pipe characters", () => {
    const rule = getStaticRule({
      from: "@company-a.com|@company-b.org|@startup-x.io|@agency-y.net|@brand-z.co",
    });

    // Should match first domain
    const message1 = getMessage({
      headers: getHeaders({ from: "user@company-a.com" }),
    });
    expect(matchesStaticRule(rule, message1)).toBe(true);

    // Should match middle domain
    const message2 = getMessage({
      headers: getHeaders({ from: "contact@startup-x.io" }),
    });
    expect(matchesStaticRule(rule, message2)).toBe(true);

    // Should match last domain
    const message3 = getMessage({
      headers: getHeaders({ from: "info@brand-z.co" }),
    });
    expect(matchesStaticRule(rule, message3)).toBe(true);

    // Should not match domain not in list
    const message4 = getMessage({
      headers: getHeaders({ from: "test@other-company.com" }),
    });
    expect(matchesStaticRule(rule, message4)).toBe(false);
  });

  it("should treat pipes as OR operator in 'to' field", () => {
    const rule = getStaticRule({
      to: "support@company.com|help@company.com|contact@company.com",
    });

    // Should match first email
    const message1 = getMessage({
      headers: getHeaders({ to: "support@company.com" }),
    });
    expect(matchesStaticRule(rule, message1)).toBe(true);

    // Should match second email
    const message2 = getMessage({
      headers: getHeaders({ to: "help@company.com" }),
    });
    expect(matchesStaticRule(rule, message2)).toBe(true);

    // Should match third email
    const message3 = getMessage({
      headers: getHeaders({ to: "contact@company.com" }),
    });
    expect(matchesStaticRule(rule, message3)).toBe(true);

    // Should not match other email
    const message4 = getMessage({
      headers: getHeaders({ to: "sales@company.com" }),
    });
    expect(matchesStaticRule(rule, message4)).toBe(false);
  });

  it("should combine wildcards with pipe OR logic in from field", () => {
    const rule = getStaticRule({
      from: "*@newsletter.com|*@marketing.org|notifications@*",
    });

    // Should match wildcard + first domain
    const message1 = getMessage({
      headers: getHeaders({ from: "weekly@newsletter.com" }),
    });
    expect(matchesStaticRule(rule, message1)).toBe(true);

    // Should match wildcard + second domain
    const message2 = getMessage({
      headers: getHeaders({ from: "campaign@marketing.org" }),
    });
    expect(matchesStaticRule(rule, message2)).toBe(true);

    // Should match third pattern with wildcard
    const message3 = getMessage({
      headers: getHeaders({ from: "notifications@example.com" }),
    });
    expect(matchesStaticRule(rule, message3)).toBe(true);

    // Should not match pattern not in list
    const message4 = getMessage({
      headers: getHeaders({ from: "test@other.com" }),
    });
    expect(matchesStaticRule(rule, message4)).toBe(false);
  });

  it("should treat pipes as literal characters in subject field", () => {
    const rule = getStaticRule({
      subject: "Status: Active | Pending | Completed",
    });
    const message = getMessage({
      headers: getHeaders({ subject: "Status: Active | Pending | Completed" }),
    });

    expect(matchesStaticRule(rule, message)).toBe(true);

    // Should not match partial pipe patterns
    const message2 = getMessage({
      headers: getHeaders({ subject: "Status: Active" }),
    });
    expect(matchesStaticRule(rule, message2)).toBe(false);
  });

  it("should treat pipes as literal characters in body field", () => {
    const rule = getStaticRule({
      body: "Choose option A | B | C from the menu",
    });
    const message = getMessage({
      headers: getHeaders(),
      textPlain: "Please choose option A | B | C from the menu to continue",
    });

    expect(matchesStaticRule(rule, message)).toBe(true);

    // Should not match partial pipe patterns
    const message2 = getMessage({
      headers: getHeaders(),
      textPlain: "Please choose option A to continue",
    });
    expect(matchesStaticRule(rule, message2)).toBe(false);
  });

  it("should handle empty patterns between pipes gracefully", () => {
    const rule = getStaticRule({ from: "@domain1.com||@domain2.com" });

    // Should still match valid domains
    const message1 = getMessage({
      headers: getHeaders({ from: "test@domain1.com" }),
    });
    expect(matchesStaticRule(rule, message1)).toBe(true);

    const message2 = getMessage({
      headers: getHeaders({ from: "test@domain2.com" }),
    });
    expect(matchesStaticRule(rule, message2)).toBe(true);
  });

  it("should handle single pattern without pipes in from field", () => {
    const rule = getStaticRule({ from: "@single-domain.com" });
    const message = getMessage({
      headers: getHeaders({ from: "user@single-domain.com" }),
    });

    expect(matchesStaticRule(rule, message)).toBe(true);
  });

  it("should handle pipes at beginning and end of from pattern", () => {
    const rule = getStaticRule({ from: "|@domain1.com|@domain2.com|" });

    // Should still match valid domains despite leading/trailing pipes
    const message1 = getMessage({
      headers: getHeaders({ from: "test@domain1.com" }),
    });
    expect(matchesStaticRule(rule, message1)).toBe(true);

    const message2 = getMessage({
      headers: getHeaders({ from: "test@domain2.com" }),
    });
    expect(matchesStaticRule(rule, message2)).toBe(true);
  });

  it("should handle mixed conditions with pipes in from and literal pipes in subject", () => {
    const rule = getStaticRule({
      from: "@company1.com|@company2.com",
      subject: "Alert | System Status",
    });

    // Should match when both conditions are met
    const message1 = getMessage({
      headers: getHeaders({
        from: "admin@company1.com",
        subject: "Alert | System Status",
      }),
    });
    expect(matchesStaticRule(rule, message1)).toBe(true);

    // Should match with second domain
    const message2 = getMessage({
      headers: getHeaders({
        from: "admin@company2.com",
        subject: "Alert | System Status",
      }),
    });
    expect(matchesStaticRule(rule, message2)).toBe(true);

    // Should not match with wrong domain
    const message3 = getMessage({
      headers: getHeaders({
        from: "admin@company3.com",
        subject: "Alert | System Status",
      }),
    });
    expect(matchesStaticRule(rule, message3)).toBe(false);

    // Should not match with partial subject
    const message4 = getMessage({
      headers: getHeaders({
        from: "admin@company1.com",
        subject: "Alert",
      }),
    });
    expect(matchesStaticRule(rule, message4)).toBe(false);
  });

  it("should handle complex email patterns with pipes", () => {
    const rule = getStaticRule({
      from: "noreply@*|*-notifications@company.com|alerts+*@service.io",
    });

    // Should match first pattern with wildcard
    const message1 = getMessage({
      headers: getHeaders({ from: "noreply@newsletter.com" }),
    });
    expect(matchesStaticRule(rule, message1)).toBe(true);

    // Should match second pattern
    const message2 = getMessage({
      headers: getHeaders({ from: "system-notifications@company.com" }),
    });
    expect(matchesStaticRule(rule, message2)).toBe(true);

    // Should match third pattern with plus and wildcard
    const message3 = getMessage({
      headers: getHeaders({ from: "alerts+billing@service.io" }),
    });
    expect(matchesStaticRule(rule, message3)).toBe(true);

    // Should not match unrelated pattern
    const message4 = getMessage({
      headers: getHeaders({ from: "user@other.com" }),
    });
    expect(matchesStaticRule(rule, message4)).toBe(false);
  });

  it("should support comma as separator in from field", () => {
    const rule = getStaticRule({
      from: "@company-a.com, @company-b.org, @startup-x.io",
    });

    // Should match first domain
    const message1 = getMessage({
      headers: getHeaders({ from: "user@company-a.com" }),
    });
    expect(matchesStaticRule(rule, message1)).toBe(true);

    // Should match second domain
    const message2 = getMessage({
      headers: getHeaders({ from: "contact@company-b.org" }),
    });
    expect(matchesStaticRule(rule, message2)).toBe(true);

    // Should match third domain
    const message3 = getMessage({
      headers: getHeaders({ from: "info@startup-x.io" }),
    });
    expect(matchesStaticRule(rule, message3)).toBe(true);

    // Should not match unlisted domain
    const message4 = getMessage({
      headers: getHeaders({ from: "test@other.com" }),
    });
    expect(matchesStaticRule(rule, message4)).toBe(false);
  });

  it("should support comma as separator in to field", () => {
    const rule = getStaticRule({
      to: "support@company.com, help@company.com, contact@company.com",
    });

    // Should match each email
    expect(
      matchesStaticRule(
        rule,
        getMessage({
          headers: getHeaders({ to: "support@company.com" }),
        }),
      ),
    ).toBe(true);

    expect(
      matchesStaticRule(
        rule,
        getMessage({
          headers: getHeaders({ to: "help@company.com" }),
        }),
      ),
    ).toBe(true);

    expect(
      matchesStaticRule(
        rule,
        getMessage({
          headers: getHeaders({ to: "contact@company.com" }),
        }),
      ),
    ).toBe(true);
  });

  it("should support OR as separator (case insensitive)", () => {
    const rule = getStaticRule({
      from: "@company1.com OR @company2.com or @company3.com",
    });

    // Should match first domain
    const message1 = getMessage({
      headers: getHeaders({ from: "admin@company1.com" }),
    });
    expect(matchesStaticRule(rule, message1)).toBe(true);

    // Should match second domain
    const message2 = getMessage({
      headers: getHeaders({ from: "admin@company2.com" }),
    });
    expect(matchesStaticRule(rule, message2)).toBe(true);

    // Should match third domain
    const message3 = getMessage({
      headers: getHeaders({ from: "admin@company3.com" }),
    });
    expect(matchesStaticRule(rule, message3)).toBe(true);

    // Should not match unlisted domain
    const message4 = getMessage({
      headers: getHeaders({ from: "admin@company4.com" }),
    });
    expect(matchesStaticRule(rule, message4)).toBe(false);
  });

  it("should support mixed separators (pipe, comma, OR)", () => {
    const rule = getStaticRule({
      from: "@company1.com | @company2.com, @company3.com OR @company4.com",
    });

    // Should match all domains regardless of separator used
    expect(
      matchesStaticRule(
        rule,
        getMessage({
          headers: getHeaders({ from: "user@company1.com" }),
        }),
      ),
    ).toBe(true);

    expect(
      matchesStaticRule(
        rule,
        getMessage({
          headers: getHeaders({ from: "user@company2.com" }),
        }),
      ),
    ).toBe(true);

    expect(
      matchesStaticRule(
        rule,
        getMessage({
          headers: getHeaders({ from: "user@company3.com" }),
        }),
      ),
    ).toBe(true);

    expect(
      matchesStaticRule(
        rule,
        getMessage({
          headers: getHeaders({ from: "user@company4.com" }),
        }),
      ),
    ).toBe(true);
  });

  it("should handle OR with various spacing", () => {
    const rule = getStaticRule({
      from: "@company1.com  OR  @company2.com OR@company3.com",
    });

    // Should match despite irregular spacing
    expect(
      matchesStaticRule(
        rule,
        getMessage({
          headers: getHeaders({ from: "user@company1.com" }),
        }),
      ),
    ).toBe(true);

    expect(
      matchesStaticRule(
        rule,
        getMessage({
          headers: getHeaders({ from: "user@company2.com" }),
        }),
      ),
    ).toBe(true);
  });

  it("should combine wildcards with comma separator", () => {
    const rule = getStaticRule({
      from: "*@newsletter.com, *@marketing.org, notifications@*",
    });

    // Should match wildcard patterns
    expect(
      matchesStaticRule(
        rule,
        getMessage({
          headers: getHeaders({ from: "weekly@newsletter.com" }),
        }),
      ),
    ).toBe(true);

    expect(
      matchesStaticRule(
        rule,
        getMessage({
          headers: getHeaders({ from: "campaign@marketing.org" }),
        }),
      ),
    ).toBe(true);

    expect(
      matchesStaticRule(
        rule,
        getMessage({
          headers: getHeaders({ from: "notifications@example.com" }),
        }),
      ),
    ).toBe(true);
  });

  it("should trim whitespace from patterns with comma separator", () => {
    const rule = getStaticRule({
      from: "  @company1.com  ,   @company2.com  ,  @company3.com  ",
    });

    // Should match despite extra whitespace
    expect(
      matchesStaticRule(
        rule,
        getMessage({
          headers: getHeaders({ from: "user@company1.com" }),
        }),
      ),
    ).toBe(true);

    expect(
      matchesStaticRule(
        rule,
        getMessage({
          headers: getHeaders({ from: "user@company2.com" }),
        }),
      ),
    ).toBe(true);
  });

  it("should not treat comma as separator in subject field", () => {
    const rule = getStaticRule({
      subject: "Option A, Option B, Option C",
    });

    // Should require exact match including commas
    const message1 = getMessage({
      headers: getHeaders({ subject: "Option A, Option B, Option C" }),
    });
    expect(matchesStaticRule(rule, message1)).toBe(true);

    // Should not match partial
    const message2 = getMessage({
      headers: getHeaders({ subject: "Option A" }),
    });
    expect(matchesStaticRule(rule, message2)).toBe(false);
  });

  it("should not treat OR as separator in subject field", () => {
    const rule = getStaticRule({
      subject: "Status: Active OR Pending",
    });

    // Should require exact match including OR
    const message1 = getMessage({
      headers: getHeaders({ subject: "Status: Active OR Pending" }),
    });
    expect(matchesStaticRule(rule, message1)).toBe(true);

    // Should not match partial
    const message2 = getMessage({
      headers: getHeaders({ subject: "Status: Active" }),
    });
    expect(matchesStaticRule(rule, message2)).toBe(false);
  });
});

describe("findMatchingRule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("matches a static rule", async () => {
    const rule = getRule({ from: "test@example.com" });
    const rules = [rule];
    const message = getMessage({
      headers: getHeaders({ from: "test@example.com" }),
    });
    const emailAccount = getEmailAccount();
    const result = await findMatchingRules({
      rules,
      message,
      emailAccount,
      provider,
      modelType: "default",
    });

    expect(result.matches[0].rule.id).toBe(rule.id);
    expect(result.matches[0].matchReasons).toEqual([
      { type: ConditionType.STATIC },
    ]);
  });

  it("matches a static domain", async () => {
    const rule = getRule({ from: "@example.com" });
    const rules = [rule];
    const message = getMessage({
      headers: getHeaders({ from: "test@example.com" }),
    });
    const emailAccount = getEmailAccount();

    const result = await findMatchingRules({
      rules,
      message,
      emailAccount,
      provider,
      modelType: "default",
    });

    expect(result.matches[0].rule.id).toBe(rule.id);
    expect(result.matches[0].matchReasons).toEqual([
      { type: ConditionType.STATIC },
    ]);
  });

  it("doens't match wrong static domain", async () => {
    const rule = getRule({ from: "@example2.com" });
    const rules = [rule];
    const message = getMessage({
      headers: getHeaders({ from: "test@example.com" }),
    });
    const emailAccount = getEmailAccount();

    const result = await findMatchingRules({
      rules,
      message,
      emailAccount,
      provider,
      modelType: "default",
    });

    expect(result.matches).toHaveLength(0);
    expect(result.reasoning).toBe("");
  });

  it("matches a group rule", async () => {
    const rule = getRule({ groupId: "group1" });

    prisma.group.findMany.mockResolvedValue([
      getGroup({
        id: "group1",
        items: [
          getGroupItem({ type: GroupItemType.FROM, value: "test@example.com" }),
        ],
        rule,
      }),
    ]);

    const rules = [rule];
    const message = getMessage({
      headers: getHeaders({ from: "test@example.com" }),
    });
    const emailAccount = getEmailAccount();

    const result = await findMatchingRules({
      rules,
      message,
      emailAccount,
      provider,
      modelType: "default",
    });

    expect(result.matches[0]?.rule.id).toBe(rule.id);
    expect(result.reasoning).toBe(
      `Matched learned pattern: "FROM: test@example.com"`,
    );
  });

  it("should match via default when group doesn't match and no other conditions", async () => {
    const rule = getRule({
      groupId: "correctGroup", // Rule specifically looks for correctGroup
    });

    // Set up groups - message doesn't match the rule's group
    prisma.group.findMany.mockResolvedValue([
      getGroup({
        id: "wrongGroup",
        items: [
          getGroupItem({
            groupId: "wrongGroup",
            type: GroupItemType.FROM,
            value: "test@example.com",
          }),
        ],
      }),
      getGroup({
        id: "correctGroup",
        items: [
          getGroupItem({
            groupId: "correctGroup",
            type: GroupItemType.FROM,
            value: "wrong@example.com",
          }),
        ],
        rule,
      }),
    ]);

    const rules = [rule];
    const message = getMessage({
      headers: getHeaders({ from: "test@example.com" }), // Doesn't match correctGroup
    });
    const emailAccount = getEmailAccount();

    const result = await findMatchingRules({
      rules,
      message,
      emailAccount,
      provider,
      modelType: "default",
    });

    // Group didn't match, but no other conditions means match everything
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.matchReasons).toEqual([]);
  });

  it("should match only when item is in the correct group", async () => {
    const rule = getRule({ groupId: "correctGroup" });

    // Set up two groups with similar items
    prisma.group.findMany.mockResolvedValue([
      getGroup({
        id: "correctGroup",
        items: [
          getGroupItem({
            groupId: "correctGroup",
            type: GroupItemType.FROM,
            value: "test@example.com",
          }),
        ],
        rule,
      }),
      getGroup({
        id: "otherGroup",
        items: [
          getGroupItem({
            groupId: "otherGroup",
            type: GroupItemType.FROM,
            value: "test@example.com", // Same value, different group
          }),
        ],
      }),
    ]);

    const rules = [rule];
    const message = getMessage({
      headers: getHeaders({ from: "test@example.com" }),
    });
    const emailAccount = getEmailAccount();

    const result = await findMatchingRules({
      rules,
      message,
      emailAccount,
      provider,
      modelType: "default",
    });

    expect(result.matches[0]?.rule.id).toBe(rule.id);
    expect(result.reasoning).toContain("test@example.com");
  });

  it("should handle multiple rules with different group conditions correctly", async () => {
    const rule1 = getRule({ id: "rule1", groupId: "group1" });
    const rule2 = getRule({ id: "rule2", groupId: "group2" });

    prisma.group.findMany.mockResolvedValue([
      getGroup({
        id: "group1",
        items: [
          getGroupItem({
            groupId: "group1",
            type: GroupItemType.FROM,
            value: "test@example.com",
          }),
        ],
        rule: rule1,
      }),
      getGroup({
        id: "group2",
        items: [
          getGroupItem({
            groupId: "group2",
            type: GroupItemType.FROM,
            value: "test@example.com",
          }),
        ],
        rule: rule2,
      }),
    ]);

    const rules = [rule1, rule2];
    const message = getMessage({
      headers: getHeaders({ from: "test@example.com" }),
    });
    const emailAccount = getEmailAccount();

    const result = await findMatchingRules({
      rules,
      message,
      emailAccount,
      provider,
      modelType: "default",
    });

    // Should match the first rule only
    expect(result.matches[0]?.rule.id).toBe("rule1");
    expect(result.reasoning).toContain("test@example.com");
  });

  it("should exclude a rule when an exclusion pattern matches", async () => {
    const rule = getRule({
      id: "rule-with-exclusion",
      groupId: "group-with-exclusion",
    });

    // Set up a group with an exclusion pattern
    prisma.group.findMany.mockResolvedValue([
      getGroup({
        id: "group-with-exclusion",
        items: [
          getGroupItem({
            groupId: "group-with-exclusion",
            type: GroupItemType.FROM,
            value: "test@example.com",
            exclude: true, // This is an exclusion pattern
          }),
        ],
        rule,
      }),
    ]);

    const rules = [rule];
    const message = getMessage({
      headers: getHeaders({ from: "test@example.com" }), // This matches the exclusion pattern
    });
    const emailAccount = getEmailAccount();

    const result = await findMatchingRules({
      rules,
      message,
      emailAccount,
      provider,
      modelType: "default",
    });

    // The rule should be excluded (not matched)
    expect(result.matches).toHaveLength(0);
    expect(result.reasoning).toBe("");
  });

  it("should match via static condition when group rule doesn't match pattern (OR operator)", async () => {
    const rule = getRule({
      id: "group-with-fallback",
      groupId: "test-group",
      from: "fallback@example.com", // Static condition
      conditionalOperator: LogicalOperator.OR,
    });

    // Group has different pattern
    prisma.group.findMany.mockResolvedValue([
      getGroup({
        id: "test-group",
        items: [
          getGroupItem({
            type: GroupItemType.FROM,
            value: "group@example.com",
          }),
        ],
        rule,
      }),
    ]);

    const rules = [rule];
    const message = getMessage({
      headers: getHeaders({ from: "fallback@example.com" }), // Matches static, not group
    });
    const emailAccount = getEmailAccount();

    const result = await findMatchingRules({
      rules,
      message,
      emailAccount,
      provider,
      modelType: "default",
    });

    expect(result.matches[0]?.rule.id).toBe(rule.id);
    expect(result.matches[0]?.matchReasons).toEqual([
      { type: ConditionType.STATIC },
    ]);
  });

  it("should match via static when group rule has group miss and static hit (AND operator)", async () => {
    const rule = getRule({
      id: "group-with-and",
      groupId: "test-group",
      from: "test@example.com", // Static condition
      conditionalOperator: LogicalOperator.AND, // Only applies to AI/Static, not groups
    });

    // Group has different pattern
    prisma.group.findMany.mockResolvedValue([
      getGroup({
        id: "test-group",
        items: [
          getGroupItem({
            type: GroupItemType.FROM,
            value: "group@example.com",
          }),
        ],
        rule,
      }),
    ]);

    const rules = [rule];
    const message = getMessage({
      headers: getHeaders({ from: "test@example.com" }), // Matches static, not group
    });
    const emailAccount = getEmailAccount();

    const result = await findMatchingRules({
      rules,
      message,
      emailAccount,
      provider,
      modelType: "default",
    });

    // Groups are independent of AND/OR operator - static match should work
    expect(result.matches[0]?.rule.id).toBe(rule.id);
    expect(result.matches[0]?.matchReasons).toEqual([
      { type: ConditionType.STATIC },
    ]);
  });

  it("should match when group rule with AND operator has both group and static match", async () => {
    const rule = getRule({
      id: "group-with-and-both",
      groupId: "test-group",
      subject: "Important", // Additional static condition
      conditionalOperator: LogicalOperator.AND,
    });

    prisma.group.findMany.mockResolvedValue([
      getGroup({
        id: "test-group",
        items: [
          getGroupItem({ type: GroupItemType.FROM, value: "test@example.com" }),
        ],
        rule,
      }),
    ]);

    const rules = [rule];
    const message = getMessage({
      headers: getHeaders({
        from: "test@example.com", // Matches group
        subject: "Important update", // Matches static
      }),
    });
    const emailAccount = getEmailAccount();

    const result = await findMatchingRules({
      rules,
      message,
      emailAccount,
      provider,
      modelType: "default",
    });

    // Should match via learned pattern and short-circuit (not check static)
    expect(result.matches[0]?.rule.id).toBe(rule.id);
    expect(result.matches[0]?.matchReasons).toEqual([
      {
        type: ConditionType.LEARNED_PATTERN,
        groupItem: expect.objectContaining({
          type: GroupItemType.FROM,
          value: "test@example.com",
        }),
        group: expect.objectContaining({ id: "test-group" }),
      },
    ]);
  });

  it("should match learned pattern when email has display name format", async () => {
    const rule = getRule({
      id: "rule-with-display-name",
      groupId: "group-with-display-name",
      instructions:
        "This is an AI instruction; should not be used if group matches.",
      conditionalOperator: LogicalOperator.OR,
    });

    // Set up a group with a learned pattern for just the email address
    prisma.group.findMany.mockResolvedValue([
      getGroup({
        id: "group-with-display-name",
        items: [
          getGroupItem({
            groupId: "group-with-display-name",
            type: GroupItemType.FROM,
            value: "central@example.com",
          }),
        ],
        rule,
      }),
    ]);
    (aiChooseRule as ReturnType<typeof vi.fn>).mockClear();

    const rules = [rule];
    const message = getMessage({
      headers: getHeaders({
        from: "Central Channel <central@example.com>",
        subject: "A benign subject",
      }),
    });
    const emailAccount = getEmailAccount();

    const result = await findMatchingRules({
      rules,
      message,
      emailAccount,
      provider,
      modelType: "default",
    });

    // Should match despite the display name format, due to the group rule
    expect(result.matches[0]?.rule.id).toBe(rule.id);
    expect(result.reasoning).toBe(
      `Matched learned pattern: "FROM: central@example.com"`,
    );
    expect(aiChooseRule).not.toHaveBeenCalled();
  });
});

describe("filterToReplyPreset", () => {
  it("should filter out no-reply emails from TO_REPLY rules", async () => {
    const toReplyRule = {
      ...getRule({
        systemType: SystemType.TO_REPLY,
      }),
      instructions: "Reply to important emails",
    };
    const otherRule = {
      ...getRule({
        systemType: SystemType.NEWSLETTER,
      }),
      instructions: "Handle newsletter",
    };

    const potentialMatches = [toReplyRule, otherRule];

    const message = getMessage({
      headers: getHeaders({ from: "noreply@company.com" }),
    });

    const result = await filterConversationStatusRules(
      potentialMatches,
      message,
      provider,
    );

    expect(result).toHaveLength(1);
    expect(result).toContain(otherRule);
  });

  it("should return all rules when no TO_REPLY rule exists", async () => {
    const newsletterRule = {
      ...getRule({
        systemType: SystemType.NEWSLETTER,
      }),
      instructions: "Handle newsletter",
    };
    const receiptRule = {
      ...getRule({
        systemType: SystemType.RECEIPT,
      }),
      instructions: "Handle receipts",
    };

    const potentialMatches = [newsletterRule, receiptRule];

    const message = getMessage({
      headers: getHeaders({ from: "user@example.com" }),
    });

    const result = await filterConversationStatusRules(
      potentialMatches,
      message,
      provider,
    );

    // Should return all rules when no TO_REPLY rule exists
    expect(result).toHaveLength(2);
    expect(result).toContain(newsletterRule);
    expect(result).toContain(receiptRule);
  });

  it("should filter out TO_REPLY rule when sender has high received count and no replies", async () => {
    const { checkSenderReplyHistory } = await import(
      "@/utils/reply-tracker/check-sender-reply-history"
    );

    (checkSenderReplyHistory as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      {
        hasReplied: false,
        receivedCount: 15, // Above threshold of 10
      },
    );

    const toReplyRule = {
      ...getRule({
        id: "to-reply-rule",
        systemType: SystemType.TO_REPLY,
      }),
      instructions: "Reply to important emails",
    };
    const otherRule = {
      ...getRule({
        systemType: SystemType.NEWSLETTER,
      }),
      instructions: "Handle newsletter",
    };

    const potentialMatches = [toReplyRule, otherRule];

    const message = getMessage({
      headers: getHeaders({ from: "sender@example.com" }),
    });

    const result = await filterConversationStatusRules(
      potentialMatches,
      message,
      provider,
    );

    // Should filter out TO_REPLY rule
    expect(result).toHaveLength(1);
    expect(result).not.toContain(toReplyRule);
    expect(result).toContain(otherRule);
    expect(checkSenderReplyHistory).toHaveBeenCalledWith(
      provider,
      "sender@example.com",
      10,
    );
  });

  it("should keep TO_REPLY rule when sender has prior replies", async () => {
    const { checkSenderReplyHistory } = await import(
      "@/utils/reply-tracker/check-sender-reply-history"
    );

    (checkSenderReplyHistory as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      {
        hasReplied: true,
        receivedCount: 20, // High count but has replies
      },
    );

    const toReplyRule = {
      ...getRule({
        systemType: SystemType.TO_REPLY,
      }),
      instructions: "Reply to important emails",
    };
    const otherRule = {
      ...getRule({
        systemType: SystemType.NEWSLETTER,
      }),
      instructions: "Handle newsletter",
    };

    const potentialMatches = [toReplyRule, otherRule];

    const message = getMessage({
      headers: getHeaders({ from: "friend@example.com" }),
    });

    const result = await filterConversationStatusRules(
      potentialMatches,
      message,
      provider,
    );

    // Should keep TO_REPLY rule because sender has replied before
    expect(result).toHaveLength(2);
    expect(result).toContain(toReplyRule);
    expect(result).toContain(otherRule);
  });

  it("should keep TO_REPLY rule when received count is below threshold", async () => {
    const { checkSenderReplyHistory } = await import(
      "@/utils/reply-tracker/check-sender-reply-history"
    );

    (checkSenderReplyHistory as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      {
        hasReplied: false,
        receivedCount: 5, // Below threshold of 10
      },
    );

    const toReplyRule = {
      ...getRule({
        systemType: SystemType.TO_REPLY,
      }),
      instructions: "Reply to important emails",
    };

    const potentialMatches = [toReplyRule];

    const message = getMessage({
      headers: getHeaders({ from: "newcontact@example.com" }),
    });

    const result = await filterConversationStatusRules(
      potentialMatches,
      message,
      provider,
    );

    // Should keep TO_REPLY rule because received count is low
    expect(result).toHaveLength(1);
    expect(result).toContain(toReplyRule);
  });

  it("should handle multiple no-reply prefix variations", async () => {
    const toReplyRule = {
      ...getRule({
        systemType: SystemType.TO_REPLY,
      }),
      instructions: "Reply to important emails",
    };

    const noReplyVariations = [
      "no-reply@company.com",
      "notifications@service.com",
      "info@business.org",
      "newsletter@news.com",
      "updates@app.io",
      "account@bank.com",
    ];

    for (const email of noReplyVariations) {
      const message = getMessage({
        headers: getHeaders({ from: email }),
      });

      const result = await filterConversationStatusRules(
        [toReplyRule],
        message,
        provider,
      );

      // All no-reply variations should return the rule (not filtered)
      expect(result).toHaveLength(0);
    }
  });

  it("should handle errors from checkSenderReplyHistory gracefully", async () => {
    const { checkSenderReplyHistory } = await import(
      "@/utils/reply-tracker/check-sender-reply-history"
    );

    (checkSenderReplyHistory as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("API error"),
    );

    const toReplyRule = {
      ...getRule({
        systemType: SystemType.TO_REPLY,
      }),
      instructions: "Reply to important emails",
    };

    const potentialMatches = [toReplyRule];

    const message = getMessage({
      headers: getHeaders({ from: "user@example.com" }),
    });

    const result = await filterConversationStatusRules(
      potentialMatches,
      message,
      provider,
    );

    // Should return all rules when error occurs
    expect(result).toHaveLength(1);
    expect(result).toContain(toReplyRule);
  });

  it("should return all rules when message has no from header", async () => {
    const toReplyRule = {
      ...getRule({
        systemType: SystemType.TO_REPLY,
      }),
      instructions: "Reply to important emails",
    };

    const potentialMatches = [toReplyRule];

    const message = getMessage({
      headers: getHeaders({ from: "" }),
    });

    const result = await filterConversationStatusRules(
      potentialMatches,
      message,
      provider,
    );

    // Should return all rules when no sender email
    expect(result).toHaveLength(1);
    expect(result).toContain(toReplyRule);
  });
});

function getRule(overrides: Partial<RuleWithActions> = {}): RuleWithActions {
  return {
    id: "r123",
    userId: "userId",
    runOnThreads: true,
    conditionalOperator: LogicalOperator.AND,
    type: null,
    systemType: null,
    ...overrides,
  } as RuleWithActions;
}

function getHeaders(
  overrides: Partial<ParsedMessageHeaders> = {},
): ParsedMessageHeaders {
  return {
    ...overrides,
  } as ParsedMessageHeaders;
}

function getMessage(overrides: Partial<ParsedMessage> = {}): ParsedMessage {
  const message = {
    id: "m1",
    threadId: "m1",
    headers: getHeaders(),
    ...overrides,
  };

  return message as ParsedMessage;
}

function getGroup(
  overrides: Partial<
    Prisma.GroupGetPayload<{ include: { items: true; rule: true } }>
  > = {},
): Prisma.GroupGetPayload<{ include: { items: true; rule: true } }> {
  return {
    id: "group1",
    name: "group",
    createdAt: new Date(),
    updatedAt: new Date(),
    emailAccountId: "emailAccountId",
    prompt: null,
    items: [],
    rule: null,
    ...overrides,
  };
}

function getGroupItem(overrides: Partial<GroupItem> = {}): GroupItem {
  return {
    id: "groupItem1",
    createdAt: new Date(),
    updatedAt: new Date(),
    groupId: "groupId",
    type: GroupItemType.FROM,
    value: "test@example.com",
    exclude: false,
    ...overrides,
  };
}

describe("findMatchingRules - Integration Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should detect and return cold email when enabled", async () => {
    const coldEmailRule = getRule({
      id: "cold-email-rule",
      systemType: SystemType.COLD_EMAIL,
    });

    vi.mocked(getColdEmailRule).mockResolvedValue(coldEmailRule);
    vi.mocked(isColdEmailRuleEnabled).mockReturnValue(true);
    vi.mocked(isColdEmail).mockResolvedValue({
      isColdEmail: true,
      reason: "ai",
    });
    vi.mocked(prisma.rule.findUniqueOrThrow).mockResolvedValue(coldEmailRule);

    const rules = [coldEmailRule];
    const message = getMessage({
      headers: getHeaders({ from: "coldemailer@example.com" }),
    });
    const emailAccount = getEmailAccount();

    const result = await findMatchingRules({
      rules,
      message,
      emailAccount,
      provider,
      modelType: "default",
    });

    expect(getColdEmailRule).toHaveBeenCalledWith(emailAccount.id);
    expect(isColdEmailRuleEnabled).toHaveBeenCalledWith(coldEmailRule);
    expect(isColdEmail).toHaveBeenCalledWith({
      email: expect.any(Object),
      emailAccount,
      provider,
      modelType: "default",
      coldEmailRule,
    });

    expect(result.matches[0]?.rule.id).toBe("cold-email-rule");
    expect(result.reasoning).toBe("ai");
  });

  it("should skip cold email detection when rule is not enabled", async () => {
    const coldEmailRule = getRule({
      id: "cold-email-rule",
      systemType: SystemType.COLD_EMAIL,
    });

    const normalRule = getRule({
      id: "normal-rule",
      from: "test@example.com",
    });

    vi.mocked(getColdEmailRule).mockResolvedValue(coldEmailRule);
    vi.mocked(isColdEmailRuleEnabled).mockReturnValue(false);

    const rules = [coldEmailRule, normalRule];
    const message = getMessage({
      headers: getHeaders({ from: "test@example.com" }),
    });
    const emailAccount = getEmailAccount();

    const result = await findMatchingRules({
      rules,
      message,
      emailAccount,
      provider,
      modelType: "default",
    });

    expect(getColdEmailRule).toHaveBeenCalledWith(emailAccount.id);
    expect(isColdEmailRuleEnabled).toHaveBeenCalledWith(coldEmailRule);
    expect(isColdEmail).not.toHaveBeenCalled();

    // Should match the normal rule instead
    expect(result.matches[0]?.rule.id).toBe("normal-rule");
  });

  it("should continue to other rules when email is not cold", async () => {
    const coldEmailRule = getRule({
      id: "cold-email-rule",
      systemType: SystemType.COLD_EMAIL,
    });

    const normalRule = getRule({
      id: "normal-rule",
      from: "test@example.com",
    });

    vi.mocked(getColdEmailRule).mockResolvedValue(coldEmailRule);
    vi.mocked(isColdEmailRuleEnabled).mockReturnValue(true);
    vi.mocked(isColdEmail).mockResolvedValue({
      isColdEmail: false,
      reason: "hasPreviousEmail",
    });

    const rules = [coldEmailRule, normalRule];
    const message = getMessage({
      headers: getHeaders({ from: "test@example.com" }),
    });
    const emailAccount = getEmailAccount();

    const result = await findMatchingRules({
      rules,
      message,
      emailAccount,
      provider,
      modelType: "default",
    });

    expect(isColdEmail).toHaveBeenCalled();

    // Should continue and match the normal rule
    expect(result.matches[0]?.rule.id).toBe("normal-rule");
  });

  it("should match calendar rule when message has .ics attachment", async () => {
    const calendarRule = getRule({
      id: "calendar-rule",
      systemType: SystemType.CALENDAR,
    });

    const rules = [calendarRule];
    const message = getMessage({
      headers: getHeaders(),
      attachments: [
        {
          filename: "meeting.ics",
          mimeType: "text/calendar",
          size: 1024,
          attachmentId: "attachment-1",
          headers: {
            "content-type": "text/calendar",
            "content-description": "",
            "content-transfer-encoding": "",
            "content-id": "",
          },
        },
      ],
    });
    const emailAccount = getEmailAccount();

    const result = await findMatchingRules({
      rules,
      message,
      emailAccount,
      provider,
      modelType: "default",
    });

    expect(result.matches[0]?.rule.id).toBe("calendar-rule");
    expect(result.matches[0]?.matchReasons).toEqual([
      { type: ConditionType.PRESET, systemType: SystemType.CALENDAR },
    ]);
  });

  it("should execute AI rules when potentialAiMatches exist", async () => {
    const aiRule = getRule({
      id: "ai-rule",
      instructions: "Archive promotional emails",
      from: null,
      to: null,
      subject: null,
      body: null,
    });

    vi.mocked(aiChooseRule).mockResolvedValue({
      rules: [{ rule: aiRule as any }],
      reason: "This is a promotional email",
    });

    const rules = [aiRule];
    const message = getMessage();
    const emailAccount = getEmailAccount();

    const result = await findMatchingRules({
      rules,
      message,
      emailAccount,
      provider,
      modelType: "default",
    });

    expect(aiChooseRule).toHaveBeenCalledWith(
      expect.objectContaining({
        email: expect.any(Object),
        emailAccount,
        modelType: "default",
        rules: expect.arrayContaining([
          expect.objectContaining({
            id: "ai-rule",
            instructions: "Archive promotional emails",
          }),
        ]),
      }),
    );

    expect(result.matches[0]?.rule.id).toBe("ai-rule");
    expect(result.matches[0]?.matchReasons).toEqual([
      { type: ConditionType.AI },
    ]);
    expect(result.reasoning).toBe("This is a promotional email");
  });

  it("should prioritize learned patterns over AI rules", async () => {
    const learnedPatternRule = getRule({
      id: "learned-rule",
      groupId: "group1",
    });

    const aiRule = getRule({
      id: "ai-rule",
      instructions: "Some AI instructions",
    });

    prisma.group.findMany.mockResolvedValue([
      getGroup({
        id: "group1",
        items: [
          getGroupItem({ type: GroupItemType.FROM, value: "test@example.com" }),
        ],
        rule: learnedPatternRule,
      }),
    ]);

    const rules = [learnedPatternRule, aiRule];
    const message = getMessage({
      headers: getHeaders({ from: "test@example.com" }),
    });
    const emailAccount = getEmailAccount();

    const result = await findMatchingRules({
      rules,
      message,
      emailAccount,
      provider,
      modelType: "default",
    });

    // Should match via learned pattern
    expect(result.matches[0]?.rule.id).toBe("learned-rule");
    expect(result.matches[0]?.matchReasons?.[0]?.type).toBe(
      ConditionType.LEARNED_PATTERN,
    );

    // AI should NOT be called because learned pattern matched
    expect(aiChooseRule).not.toHaveBeenCalled();
  });

  it("should skip rules with runOnThreads=false when message is a thread", async () => {
    const threadRule = getRule({
      id: "thread-rule",
      from: "test@example.com",
      runOnThreads: false,
    });

    // Mock provider to return true for isReplyInThread
    const threadProvider = {
      isReplyInThread: vi.fn().mockReturnValue(true),
    } as unknown as EmailProvider;

    // Mock no previously executed rules in thread
    prisma.executedRule.findMany.mockResolvedValue([]);

    const rules = [threadRule];
    const message = getMessage({
      headers: getHeaders({ from: "test@example.com" }),
    });
    const emailAccount = getEmailAccount();

    const result = await findMatchingRules({
      rules,
      message,
      emailAccount,
      provider: threadProvider,
      modelType: "default",
    });

    // Rule should not match because it's a thread and runOnThreads=false
    expect(result.matches).toHaveLength(0);
  });

  describe("filterMultipleSystemRules branches", () => {
    it("returns all system rules when none marked primary (plus conversation rules)", () => {
      const sysA: {
        name: string;
        instructions: string;
        systemType: string | null;
      } = {
        name: "Sys A",
        instructions: "",
        systemType: "TO_REPLY",
      };
      const sysB: {
        name: string;
        instructions: string;
        systemType: string | null;
      } = {
        name: "Sys B",
        instructions: "",
        systemType: "AWAITING_REPLY",
      };
      const conv: {
        name: string;
        instructions: string;
        systemType: string | null;
      } = {
        name: "Conv",
        instructions: "",
        systemType: null,
      };

      const result = filterMultipleSystemRules([
        { rule: sysA, isPrimary: false },
        { rule: sysB },
        { rule: conv },
      ]);

      expect(result).toEqual([sysA, sysB, conv]);
    });

    it("keeps only the primary system rule when multiple system rules present", () => {
      const sysA: {
        name: string;
        instructions: string;
        systemType: string | null;
      } = {
        name: "Sys A",
        instructions: "",
        systemType: "TO_REPLY",
      };
      const sysB: {
        name: string;
        instructions: string;
        systemType: string | null;
      } = {
        name: "Sys B",
        instructions: "",
        systemType: "AWAITING_REPLY",
      };
      const conv: {
        name: string;
        instructions: string;
        systemType: string | null;
      } = {
        name: "Conv",
        instructions: "",
        systemType: null,
      };

      const result = filterMultipleSystemRules([
        { rule: sysA, isPrimary: false },
        { rule: sysB, isPrimary: true },
        { rule: conv },
      ]);

      expect(result).toEqual([sysB, conv]);
    });
  });

  describe("Group rules fallthrough when no groups exist", () => {
    it("falls through to static/AI evaluation when getGroupsWithRules returns empty", async () => {
      const groupRule = getRule({
        id: "group-rule-1",
        from: "group@example.com",
        groupId: "g1",
      });

      // Ensure provider treats this as non-thread
      const providerNoThread = {
        isReplyInThread: vi.fn().mockReturnValue(false),
      } as unknown as EmailProvider;

      // Mock groups to be empty so the code path skips learned pattern branch
      const groupModule = await import("@/utils/group/find-matching-group");
      vi.spyOn(groupModule, "getGroupsWithRules").mockResolvedValue([] as any);

      const rules = [groupRule];
      const message = getMessage({
        headers: getHeaders({ from: "group@example.com" }),
      });
      const emailAccount = getEmailAccount();

      const result = await findMatchingRules({
        rules,
        message,
        emailAccount,
        provider: providerNoThread,
        modelType: "default",
      });

      // Should match via static evaluation since groups are empty
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]?.rule.id).toBe("group-rule-1");
    });
  });
  describe("Thread continuity - runOnThreads=false rules", () => {
    it("should continue applying rule in a thread when it was previously applied", async () => {
      const notifRule = getRule({
        id: "notif-rule",
        from: "notif@example.com",
        runOnThreads: false,
      });

      // Mock provider to indicate this is a thread
      const threadProvider = {
        isReplyInThread: vi.fn().mockReturnValue(true),
      } as unknown as EmailProvider;

      // Mock DB to return previously executed rule id
      prisma.executedRule.findMany.mockResolvedValue([
        { ruleId: "notif-rule" },
      ] as any);

      const rules = [notifRule];
      const message = getMessage({
        headers: getHeaders({ from: "notif@example.com" }),
      });
      const emailAccount = getEmailAccount();

      const result = await findMatchingRules({
        rules,
        message,
        emailAccount,
        provider: threadProvider,
        modelType: "default",
      });

      expect(prisma.executedRule.findMany).toHaveBeenCalledTimes(1);
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]?.rule.id).toBe("notif-rule");
    });

    it("should lazy-load previous rules only once for multiple runOnThreads=false rules", async () => {
      const ruleA = getRule({
        id: "rule-a",
        from: "multi@example.com",
        runOnThreads: false,
      });
      const ruleB = getRule({
        id: "rule-b",
        from: "multi@example.com",
        runOnThreads: false,
      });

      const threadProvider = {
        isReplyInThread: vi.fn().mockReturnValue(true),
      } as unknown as EmailProvider;

      prisma.executedRule.findMany.mockResolvedValue([
        { ruleId: "rule-a" },
        { ruleId: "rule-b" },
      ] as any);

      const rules = [ruleA, ruleB];
      const message = getMessage({
        headers: getHeaders({ from: "multi@example.com" }),
      });
      const emailAccount = getEmailAccount();

      const result = await findMatchingRules({
        rules,
        message,
        emailAccount,
        provider: threadProvider,
        modelType: "default",
      });

      expect(prisma.executedRule.findMany).toHaveBeenCalledTimes(1);
      expect(result.matches.map((m) => m.rule.id).sort()).toEqual([
        "rule-a",
        "rule-b",
      ]);
    });

    it("should not query DB when message is not a thread", async () => {
      const notifRule = getRule({
        id: "not-thread",
        from: "no-thread@example.com",
        runOnThreads: false,
      });

      const providerNotThread = {
        isReplyInThread: vi.fn().mockReturnValue(false),
      } as unknown as EmailProvider;

      const rules = [notifRule];
      const message = getMessage({
        headers: getHeaders({ from: "no-thread@example.com" }),
      });
      const emailAccount = getEmailAccount();

      const result = await findMatchingRules({
        rules,
        message,
        emailAccount,
        provider: providerNotThread,
        modelType: "default",
      });

      expect(prisma.executedRule.findMany).not.toHaveBeenCalled();
      // Not a thread, so normal matching applies (matches by static from)
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]?.rule.id).toBe("not-thread");
    });

    it("should not query DB when rule has runOnThreads=true (even in a thread)", async () => {
      const threadRule = getRule({
        id: "thread-ok",
        from: "yes-thread@example.com",
        runOnThreads: true,
      });

      const threadProvider = {
        isReplyInThread: vi.fn().mockReturnValue(true),
      } as unknown as EmailProvider;

      const rules = [threadRule];
      const message = getMessage({
        headers: getHeaders({ from: "yes-thread@example.com" }),
      });
      const emailAccount = getEmailAccount();

      const result = await findMatchingRules({
        rules,
        message,
        emailAccount,
        provider: threadProvider,
        modelType: "default",
      });

      expect(prisma.executedRule.findMany).not.toHaveBeenCalled();
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]?.rule.id).toBe("thread-ok");
    });
  });

  it("should handle invalid regex patterns gracefully", () => {
    const rule = getRule({
      from: "[invalid(regex",
    });

    const message = getMessage({
      headers: getHeaders({ from: "test@example.com" }),
    });

    // Should not throw, just return false
    expect(() => matchesStaticRule(rule, message)).not.toThrow();
    const result = matchesStaticRule(rule, message);
    expect(result).toBe(false);
  });

  it("should combine static match with AI potentialMatch correctly", async () => {
    const mixedRule = getRule({
      id: "mixed-rule",
      from: "test@example.com",
      instructions: "Archive if promotional",
      conditionalOperator: LogicalOperator.AND,
    });

    vi.mocked(aiChooseRule).mockResolvedValue({
      rules: [{ rule: mixedRule as any }],
      reason: "Email is promotional",
    });

    const rules = [mixedRule];
    const message = getMessage({
      headers: getHeaders({ from: "test@example.com" }),
    });
    const emailAccount = getEmailAccount();

    const result = await findMatchingRules({
      rules,
      message,
      emailAccount,
      provider,
      modelType: "default",
    });

    // Static matched, so should be sent to AI for AND check
    expect(aiChooseRule).toHaveBeenCalled();
    expect(result.matches[0]?.rule.id).toBe("mixed-rule");
  });

  it("merges static match with AI rule and combines reasoning text", async () => {
    const staticRule = getRule({
      id: "static-rule-1",
      from: "reason@example.com",
    });
    const aiOnlyRule = getRule({ id: "ai-rule-2", instructions: "Do X" });

    // Ensure potentialAiMatches includes aiOnlyRule
    vi.mocked(aiChooseRule).mockResolvedValue({
      rules: [aiOnlyRule as any],
      reason: "AI reasoning here",
    });

    const rules = [staticRule, aiOnlyRule];
    const message = getMessage({
      headers: getHeaders({ from: "reason@example.com" }),
    });
    const emailAccount = getEmailAccount();

    const result = await findMatchingRules({
      rules,
      message,
      emailAccount,
      provider,
      modelType: "default",
    });

    // Reasoning should combine existing matchReasons text + AI reason
    // existing part comes from getMatchReason => "Matched static conditions"
    expect(result.reasoning).toBe(
      "Matched static conditions; AI reasoning here",
    );
  });

  it("matchesStaticRule: catches RegExp construction error and returns false", () => {
    const rule = getRule({ from: "trigger-error" });
    const message = getMessage({
      headers: getHeaders({ from: "any@example.com" }),
    });

    const OriginalRegExp = RegExp;
    // Monkeypatch RegExp to throw for our specific pattern
    // Only for this test; restore afterwards
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).RegExp = ((pattern: string) => {
      if (pattern.includes("trigger-error")) {
        throw new Error("synthetic error");
      }
      // Delegate to original
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return new (OriginalRegExp as any)(pattern);
    }) as unknown as RegExpConstructor;

    try {
      const matched = matchesStaticRule(rule as any, message as any);
      expect(matched).toBe(false);
    } finally {
      // restore
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).RegExp =
        OriginalRegExp as unknown as RegExpConstructor;
    }
  });

  it("AI path: returns only AI reasoning when no static matches and AI returns no rules", async () => {
    const aiOnlyRule = getRule({ id: "ai-only-1", instructions: "Do Y" });

    vi.mocked(aiChooseRule).mockResolvedValue({
      rules: [],
      reason: "AI had reasoning but selected nothing",
    });

    const rules = [aiOnlyRule];
    const message = getMessage({
      // No static matchers
      headers: getHeaders({ from: "nobody@example.com" }),
    });
    const emailAccount = getEmailAccount();

    const result = await findMatchingRules({
      rules,
      message,
      emailAccount,
      provider,
      modelType: "default",
    });

    expect(result.matches.map((m) => m.rule.id)).toEqual([]);
    expect(result.reasoning).toBe("AI had reasoning but selected nothing");
  });

  it("AI path: dedups AI-selected rule when it duplicates a static match", async () => {
    const dupRule = getRule({
      id: "dup-rule",
      from: "dup@example.com",
      instructions: "Use AI too",
      runOnThreads: true,
    });

    vi.mocked(aiChooseRule).mockResolvedValue({
      rules: [{ rule: dupRule as any }],
      reason: "AI selects dup-rule",
    });

    const rules = [dupRule];
    const message = getMessage({
      headers: getHeaders({ from: "dup@example.com" }),
    });
    const emailAccount = getEmailAccount();

    const spy = vi.spyOn(provider, "isReplyInThread").mockReturnValue(false);
    try {
      const result = await findMatchingRules({
        rules,
        message,
        emailAccount,
        provider,
        modelType: "default",
      });

      // Only one occurrence of dup-rule should remain
      const ids = result.matches.map((m) => m.rule.id);
      expect(ids).toEqual(["dup-rule"]);
      expect(result.reasoning).toContain("AI selects dup-rule");
    } finally {
      spy.mockRestore();
    }
  });
});

describe("evaluateRuleConditions", () => {
  it("should match STATIC condition", () => {
    const rule = getRule({ from: "test@example.com" });
    const message = getMessage({
      headers: getHeaders({ from: "test@example.com" }),
    });

    const result = evaluateRuleConditions({ rule, message });

    expect(result.matched).toBe(true);
    expect(result.potentialAiMatch).toBe(false);
    expect(result.matchReasons).toEqual([{ type: ConditionType.STATIC }]);
  });

  it("should not match when STATIC condition fails", () => {
    const rule = getRule({ from: "test@example.com" });
    const message = getMessage({
      headers: getHeaders({ from: "other@example.com" }),
    });

    const result = evaluateRuleConditions({ rule, message });

    expect(result.matched).toBe(false);
    expect(result.potentialAiMatch).toBe(false);
    expect(result.matchReasons).toEqual([]);
  });

  it("should return potentialAiMatch for AI-only rule", () => {
    const rule = getRule({
      instructions: "Some AI instructions",
      from: null,
      to: null,
      subject: null,
      body: null,
    });
    const message = getMessage();

    const result = evaluateRuleConditions({ rule, message });

    expect(result.matched).toBe(false);
    expect(result.potentialAiMatch).toBe(true);
    expect(result.matchReasons).toEqual([]);
  });

  it("OR: should match immediately with STATIC, ignoring AI", () => {
    const rule = getRule({
      conditionalOperator: LogicalOperator.OR,
      from: "test@example.com",
      instructions: "Some AI instructions",
    });
    const message = getMessage({
      headers: getHeaders({ from: "test@example.com" }),
    });

    const result = evaluateRuleConditions({ rule, message });

    expect(result.matched).toBe(true);
    expect(result.potentialAiMatch).toBe(false);
    expect(result.matchReasons).toEqual([{ type: ConditionType.STATIC }]);
  });

  it("OR: should return potentialAiMatch when STATIC fails but has AI", () => {
    const rule = getRule({
      conditionalOperator: LogicalOperator.OR,
      from: "test@example.com",
      instructions: "Some AI instructions",
    });
    const message = getMessage({
      headers: getHeaders({ from: "other@example.com" }),
    });

    const result = evaluateRuleConditions({ rule, message });

    expect(result.matched).toBe(false);
    expect(result.potentialAiMatch).toBe(true);
    expect(result.matchReasons).toEqual([]);
  });

  it("AND: should return potentialAiMatch when STATIC passes and has AI", () => {
    const rule = getRule({
      conditionalOperator: LogicalOperator.AND,
      from: "test@example.com",
      instructions: "Some AI instructions",
    });
    const message = getMessage({
      headers: getHeaders({ from: "test@example.com" }),
    });

    const result = evaluateRuleConditions({ rule, message });

    expect(result.matched).toBe(false);
    expect(result.potentialAiMatch).toBe(true);
    expect(result.matchReasons).toEqual([{ type: ConditionType.STATIC }]);
  });

  it("AND: should not match when STATIC fails even with AI", () => {
    const rule = getRule({
      conditionalOperator: LogicalOperator.AND,
      from: "test@example.com",
      instructions: "Some AI instructions",
    });
    const message = getMessage({
      headers: getHeaders({ from: "other@example.com" }),
    });

    const result = evaluateRuleConditions({ rule, message });

    expect(result.matched).toBe(false);
    expect(result.potentialAiMatch).toBe(false);
    expect(result.matchReasons).toEqual([]);
  });

  it("should match when no conditions are present", () => {
    const rule = getRule({
      from: null,
      to: null,
      subject: null,
      body: null,
      instructions: null,
    });
    const message = getMessage();

    const result = evaluateRuleConditions({ rule, message });

    expect(result.matched).toBe(true);
    expect(result.potentialAiMatch).toBe(false);
    expect(result.matchReasons).toEqual([]);
  });

  it("OR: should not match when STATIC fails and no AI condition", () => {
    const rule = getRule({
      conditionalOperator: LogicalOperator.OR,
      from: "test@example.com",
      instructions: null,
    });
    const message = getMessage({
      headers: getHeaders({ from: "other@example.com" }),
    });

    const result = evaluateRuleConditions({ rule, message });

    expect(result.matched).toBe(false);
    expect(result.potentialAiMatch).toBe(false);
    expect(result.matchReasons).toEqual([]);
  });
});

function getStaticRule(
  rule: Partial<Pick<RuleWithActions, "from" | "to" | "subject" | "body">>,
) {
  return {
    from: null,
    to: null,
    subject: null,
    body: null,
    ...rule,
  };
}
