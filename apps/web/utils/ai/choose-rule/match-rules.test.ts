import { describe, it, expect, vi, beforeEach } from "vitest";
import type { gmail_v1 } from "@googleapis/gmail";
import {
  findMatchingRule,
  matchesStaticRule,
  filterToReplyPreset,
} from "./match-rules";
import {
  type Category,
  CategoryFilterType,
  type GroupItem,
  GroupItemType,
  LogicalOperator,
  type Newsletter,
  type Prisma,
  SystemType,
} from "@prisma/client";
import type {
  RuleWithActionsAndCategories,
  ParsedMessage,
  ParsedMessageHeaders,
} from "@/utils/types";
import prisma from "@/utils/__mocks__/prisma";
import { aiChooseRule } from "@/utils/ai/choose-rule/ai-choose-rule";
import { getEmailAccount } from "@/__tests__/helpers";

// Run with:
// pnpm test match-rules.test.ts

const gmail = {} as gmail_v1.Gmail;

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/ai/choose-rule/ai-choose-rule", () => ({
  aiChooseRule: vi.fn(),
}));
vi.mock("@/utils/reply-tracker/check-sender-reply-history", () => ({
  checkSenderReplyHistory: vi.fn(),
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
    const result = await findMatchingRule({
      rules,
      message,
      emailAccount,
      gmail,
    });

    expect(result.rule?.id).toBe(rule.id);
    expect(result.reason).toBe("Matched static conditions");
  });

  it("matches a static domain", async () => {
    const rule = getRule({ from: "@example.com" });
    const rules = [rule];
    const message = getMessage({
      headers: getHeaders({ from: "test@example.com" }),
    });
    const emailAccount = getEmailAccount();

    const result = await findMatchingRule({
      rules,
      message,
      emailAccount,
      gmail,
    });

    expect(result.rule?.id).toBe(rule.id);
    expect(result.reason).toBe("Matched static conditions");
  });

  it("doens't match wrong static domain", async () => {
    const rule = getRule({ from: "@example2.com" });
    const rules = [rule];
    const message = getMessage({
      headers: getHeaders({ from: "test@example.com" }),
    });
    const emailAccount = getEmailAccount();

    const result = await findMatchingRule({
      rules,
      message,
      emailAccount,
      gmail,
    });

    expect(result.rule?.id).toBeUndefined();
    expect(result.reason).toBeUndefined();
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

    const result = await findMatchingRule({
      rules,
      message,
      emailAccount,
      gmail,
    });

    expect(result.rule?.id).toBe(rule.id);
    expect(result.reason).toBe(
      `Matched learned pattern: "FROM: test@example.com"`,
    );
  });

  it("matches a smart category rule", async () => {
    prisma.newsletter.findUnique.mockResolvedValue(
      getNewsletter({ categoryId: "test-category" }),
    );

    const rule = getRule({
      categoryFilters: [getCategory({ id: "test-category" })],
      categoryFilterType: CategoryFilterType.INCLUDE,
    });
    const rules = [rule];
    const message = getMessage();
    const emailAccount = getEmailAccount();

    const result = await findMatchingRule({
      rules,
      message,
      emailAccount,
      gmail,
    });

    expect(result.rule?.id).toBe(rule.id);
    expect(result.reason).toBe('Matched category: "category"');
  });

  it("matches a smart category rule with exclude", async () => {
    prisma.newsletter.findUnique.mockResolvedValue(
      getNewsletter({ categoryId: "test-category" }),
    );

    const rule = getRule({
      categoryFilters: [getCategory({ id: "test-category" })],
      categoryFilterType: CategoryFilterType.EXCLUDE,
    });
    const rules = [rule];
    const message = getMessage();
    const emailAccount = getEmailAccount();

    const result = await findMatchingRule({
      rules,
      message,
      emailAccount,
      gmail,
    });

    expect(result.rule?.id).toBeUndefined();
    expect(result.reason).toBeUndefined();
  });

  it("matches a rule with multiple conditions AND (category and group)", async () => {
    const rule = getRule({
      conditionalOperator: LogicalOperator.AND,
      categoryFilters: [getCategory({ id: "category1" })],
      groupId: "group1",
    });

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
        rule,
      }),
    ]);
    prisma.newsletter.findUnique.mockResolvedValue(
      getNewsletter({ categoryId: "category1" }),
    );

    const rules = [rule];
    const message = getMessage({
      headers: getHeaders({ from: "test@example.com" }),
    });
    const emailAccount = getEmailAccount();

    const result = await findMatchingRule({
      rules,
      message,
      emailAccount,
      gmail,
    });

    expect(result.rule?.id).toBe(rule.id);
    expect(result.reason).toBe(
      `Matched learned pattern: "FROM: test@example.com"`,
    );
  });

  it("matches a rule with multiple conditions AND (category and AI)", async () => {
    prisma.newsletter.findUnique.mockResolvedValue(
      getNewsletter({ categoryId: "newsletterCategory" }),
    );

    const rule = getRule({
      conditionalOperator: LogicalOperator.AND,
      instructions: "Match if the email is an AI newsletter",
      categoryFilters: [getCategory({ id: "newsletterCategory" })],
    });

    (aiChooseRule as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      return {
        reason: "reason",
        rule: { id: "r123" },
      };
    });

    const rules = [rule];
    const message = getMessage({
      headers: getHeaders({ from: "ai@newsletter.com" }),
    });
    const emailAccount = getEmailAccount();

    const result = await findMatchingRule({
      rules,
      message,
      emailAccount,
      gmail,
    });

    expect(result.rule?.id).toBe(rule.id);
    expect(result.reason).toBeDefined();
    expect(aiChooseRule).toHaveBeenCalledOnce();
  });

  it("doesn't match when AI condition fails (category matches but AI doesn't)", async () => {
    prisma.newsletter.findUnique.mockResolvedValue(
      getNewsletter({ categoryId: "newsletterCategory" }),
    );

    const rule = getRule({
      conditionalOperator: LogicalOperator.AND,
      instructions: "Match if the email is an AI newsletter",
      categoryFilters: [getCategory({ id: "newsletterCategory" })],
    });

    (aiChooseRule as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      return {
        reason: "Not an AI newsletter",
        rule: undefined,
      };
    });

    const rules = [rule];
    const message = getMessage({
      headers: getHeaders({ from: "marketing@newsletter.com" }),
    });
    const emailAccount = getEmailAccount();

    const result = await findMatchingRule({
      rules,
      message,
      emailAccount,
      gmail,
    });

    expect(result.rule).toBeUndefined();
    expect(result.reason).toBeDefined();
    expect(aiChooseRule).toHaveBeenCalledOnce();
  });

  it("should match with only one of category or group", async () => {
    prisma.newsletter.findUnique.mockResolvedValue(
      getNewsletter({ categoryId: "category1" }),
    );
    prisma.group.findMany.mockResolvedValue([]);

    const rule = getRule({
      conditionalOperator: LogicalOperator.AND,
      categoryFilters: [getCategory({ id: "category1" })],
      groupId: "group1",
    });
    const rules = [rule];
    const message = getMessage();
    const emailAccount = getEmailAccount();

    const result = await findMatchingRule({
      rules,
      message,
      emailAccount,
      gmail,
    });

    expect(result.rule?.id).toBe(rule.id);
    expect(result.reason).toBe('Matched category: "category"');
  });

  it("matches with OR and one of category or group", async () => {
    prisma.newsletter.findUnique.mockResolvedValue(
      getNewsletter({ categoryId: "category1" }),
    );
    prisma.group.findMany.mockResolvedValue([]);

    const rule = getRule({
      conditionalOperator: LogicalOperator.OR,
      categoryFilters: [getCategory({ id: "category1" })],
      groupId: "group1",
    });
    const rules = [rule];
    const message = getMessage();
    const emailAccount = getEmailAccount();

    const result = await findMatchingRule({
      rules,
      message,
      emailAccount,
      gmail,
    });

    expect(result.rule?.id).toBe(rule.id);
    expect(result.reason).toBe('Matched category: "category"');
  });

  it("should not match when item matches but is in wrong group", async () => {
    const rule = getRule({
      groupId: "correctGroup", // Rule specifically looks for correctGroup
    });

    // Set up two groups - one referenced by the rule, one not
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
      headers: getHeaders({ from: "test@example.com" }), // This matches item in wrongGroup
    });
    const emailAccount = getEmailAccount();

    const result = await findMatchingRule({
      rules,
      message,
      emailAccount,
      gmail,
    });

    expect(result.rule).toBeUndefined();
    expect(result.reason).toBeUndefined();
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

    const result = await findMatchingRule({
      rules,
      message,
      emailAccount,
      gmail,
    });

    expect(result.rule?.id).toBe(rule.id);
    expect(result.reason).toContain("test@example.com");
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

    const result = await findMatchingRule({
      rules,
      message,
      emailAccount,
      gmail,
    });

    // Should match the first rule only
    expect(result.rule?.id).toBe("rule1");
    expect(result.reason).toContain("test@example.com");
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

    const result = await findMatchingRule({
      rules,
      message,
      emailAccount,
      gmail,
    });

    // The rule should be excluded (not matched)
    expect(result.rule).toBeUndefined();
    expect(result.reason).toBeUndefined();
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

    const result = await findMatchingRule({
      rules,
      message,
      emailAccount,
      gmail,
    });

    // Should match despite the display name format, due to the group rule
    expect(result.rule?.id).toBe(rule.id);
    expect(result.reason).toBe(
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

    const result = await filterToReplyPreset(potentialMatches, message, gmail);

    // Should return all rules when sender is a no-reply address
    expect(result).toHaveLength(2);
    expect(result).toContain(toReplyRule);
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

    const result = await filterToReplyPreset(potentialMatches, message, gmail);

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

    const result = await filterToReplyPreset(potentialMatches, message, gmail);

    // Should filter out TO_REPLY rule
    expect(result).toHaveLength(1);
    expect(result).not.toContain(toReplyRule);
    expect(result).toContain(otherRule);
    expect(checkSenderReplyHistory).toHaveBeenCalledWith(
      gmail,
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

    const result = await filterToReplyPreset(potentialMatches, message, gmail);

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

    const result = await filterToReplyPreset(potentialMatches, message, gmail);

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

      const result = await filterToReplyPreset([toReplyRule], message, gmail);

      // All no-reply variations should return the rule (not filtered)
      expect(result).toHaveLength(1);
      expect(result).toContain(toReplyRule);
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

    const result = await filterToReplyPreset(potentialMatches, message, gmail);

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

    const result = await filterToReplyPreset(potentialMatches, message, gmail);

    // Should return all rules when no sender email
    expect(result).toHaveLength(1);
    expect(result).toContain(toReplyRule);
  });
});

function getRule(
  overrides: Partial<RuleWithActionsAndCategories> = {},
): RuleWithActionsAndCategories {
  return {
    id: "r123",
    userId: "userId",
    runOnThreads: true,
    conditionalOperator: LogicalOperator.AND,
    categoryFilters: [],
    categoryFilterType: CategoryFilterType.INCLUDE,
    type: null,
    ...overrides,
  } as RuleWithActionsAndCategories;
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

function getCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: "category1",
    name: "category",
    createdAt: new Date(),
    updatedAt: new Date(),
    emailAccountId: "emailAccountId",
    description: null,
    ...overrides,
  };
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

function getNewsletter(overrides: Partial<Newsletter> = {}): Newsletter {
  return {
    id: "newsletter1",
    createdAt: new Date(),
    updatedAt: new Date(),
    userId: "userId",
    email: "test@example.com",
    status: null,
    categoryId: "category1",
    ...overrides,
  } as Newsletter;
}

function getStaticRule(
  rule: Partial<
    Pick<RuleWithActionsAndCategories, "from" | "to" | "subject" | "body">
  >,
) {
  return {
    from: null,
    to: null,
    subject: null,
    body: null,
    ...rule,
  };
}
