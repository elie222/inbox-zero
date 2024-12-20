import { describe, it, expect, vi, afterEach } from "vitest";
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

// Run with:
// pnpm test match-rules.test.ts

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");

describe("findMatchingRule", () => {
  it("matches a static rule", async () => {
    prisma.newsletter.findUnique.mockResolvedValue(
      getNewsletter({ categoryId: "test-category" }),
    );

    const rule = getRule({ from: "test@example.com" });
    const rules = [rule];
    const message = getMessage({
      headers: getHeaders({ from: "test@example.com" }),
    });
    const user = getUser();

    const result = await findMatchingRule(rules, message, user);

    expect(result.rule?.id).toBe(rule.id);
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
    expect(result.reason).toBeUndefined();
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
    expect(result.reason).toBeUndefined();
  });

  // it("matches a smart category rule with exclude", async () => {
  //   const rule = getRule({
  //     categoryFilters: [getCategory()],
  //     categoryFilterType: CategoryFilterType.EXCLUDE,
  //   });
  //   const rules = [rule];
  //   const message = getMessage({
  //     headers: getHeaders({ from: "test@example.com" }),
  //   });
  //   const user = getUser();
  // });
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
