import { describe, it, expect, vi, beforeEach } from "vitest";
import { findMatchingRule } from "./match-rules";
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
    prisma.group.findMany.mockResolvedValue([
      getGroup({
        id: "group1",
        items: [
          getGroupItem({ type: GroupItemType.FROM, value: "test@example.com" }),
        ],
      }),
    ]);

    const rule = getRule({ groupId: "group1" });
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
    prisma.group.findMany.mockResolvedValue([
      getGroup({
        id: "group1",
        items: [
          getGroupItem({ type: GroupItemType.FROM, value: "test@example.com" }),
        ],
      }),
    ]);
    prisma.newsletter.findUnique.mockResolvedValue(
      getNewsletter({ categoryId: "category1" }),
    );

    const rule = getRule({
      conditionalOperator: LogicalOperator.AND,
      categoryFilters: [getCategory({ id: "category1" })],
      groupId: "group1",
    });
    const rules = [rule];
    const message = getMessage({
      headers: getHeaders({ from: "test@example.com" }),
    });
    const user = getUser();

    const result = await findMatchingRule(rules, message, user);

    expect(result.rule?.id).toBe(rule.id);
    expect(result.reason).toBe(
      `Matched group item: "FROM: test@example.com", Matched category: "category"`,
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

  it("doesn't match with only one of category or group", async () => {
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

    expect(result.rule?.id).toBeUndefined();
    expect(result.reason).toBeUndefined();
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
  overrides: Partial<Prisma.GroupGetPayload<{ include: { items: true } }>> = {},
): Prisma.GroupGetPayload<{ include: { items: true } }> {
  return {
    id: "group1",
    name: "group",
    createdAt: new Date(),
    updatedAt: new Date(),
    userId: "userId",
    prompt: null,
    items: [],
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
