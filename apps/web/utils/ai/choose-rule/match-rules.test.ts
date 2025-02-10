import { describe, it, expect, vi, beforeEach } from "vitest";
import { findMatchingRule, matchesStaticRule } from "./match-rules";
import {
  type Category,
  CategoryFilterType,
  type GroupItem,
  GroupItemType,
  LogicalOperator,
  type Newsletter,
  type Prisma,
} from "@prisma/client";
import type {
  RuleWithActionsAndCategories,
  ParsedMessage,
  ParsedMessageHeaders,
} from "@/utils/types";
import prisma from "@/utils/__mocks__/prisma";
import { aiChooseRule } from "@/utils/ai/choose-rule/ai-choose-rule";

// Run with:
// pnpm test match-rules.test.ts

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/ai/choose-rule/ai-choose-rule", () => ({
  aiChooseRule: vi.fn(),
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
    const user = getUser();

    const result = await findMatchingRule(rules, message, user);

    expect(result.rule?.id).toBe(rule.id);
    expect(result.reason).toBe("Matched static conditions");
  });

  it("matches a static domain", async () => {
    const rule = getRule({ from: "@example.com" });
    const rules = [rule];
    const message = getMessage({
      headers: getHeaders({ from: "test@example.com" }),
    });
    const user = getUser();

    const result = await findMatchingRule(rules, message, user);

    expect(result.rule?.id).toBe(rule.id);
    expect(result.reason).toBe("Matched static conditions");
  });

  it("doens't match wrong static domain", async () => {
    const rule = getRule({ from: "@example2.com" });
    const rules = [rule];
    const message = getMessage({
      headers: getHeaders({ from: "test@example.com" }),
    });
    const user = getUser();

    const result = await findMatchingRule(rules, message, user);

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
    const user = getUser();

    const result = await findMatchingRule(rules, message, user);

    expect(result.rule?.id).toBe(rule.id);
    expect(result.reason).toBe(`Matched group item: "FROM: test@example.com"`);
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
    const user = getUser();

    const result = await findMatchingRule(rules, message, user);

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
    const user = getUser();

    const result = await findMatchingRule(rules, message, user);

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
    const user = getUser();

    const result = await findMatchingRule(rules, message, user);

    expect(result.rule?.id).toBe(rule.id);
    expect(result.reason).toBe(`Matched group item: "FROM: test@example.com"`);
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
    const user = getUser();

    const result = await findMatchingRule(rules, message, user);

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
    const user = getUser();

    const result = await findMatchingRule(rules, message, user);

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
    const user = getUser();

    const result = await findMatchingRule(rules, message, user);

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
    const user = getUser();

    const result = await findMatchingRule(rules, message, user);

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
    const user = getUser();

    const result = await findMatchingRule(rules, message, user);

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
    const user = getUser();

    const result = await findMatchingRule(rules, message, user);

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
    const user = getUser();

    const result = await findMatchingRule(rules, message, user);

    // Should match the first rule only
    expect(result.rule?.id).toBe("rule1");
    expect(result.reason).toContain("test@example.com");
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

function getUser() {
  return {
    id: "user1",
    aiModel: null,
    aiProvider: null,
    email: "user@test.com",
    aiApiKey: null,
    about: null,
  };
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
    userId: "userId",
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
    userId: "userId",
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
