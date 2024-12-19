import { describe, it, expect, vi } from "vitest";
import { findMatchingRule } from "./match-rules";
import { type Action, LogicalOperator } from "@prisma/client";
import type {
  RuleWithActionsAndCategories,
  ParsedMessage,
  ParsedMessageHeaders,
} from "@/utils/types";

// Run with:
// pnpm test match-rules.test.ts

// Mock dependencies
vi.mock("server-only", () => ({}));

vi.mock("@/utils/ai/choose-rule/ai-choose-rule", () => ({
  aiChooseRule: vi
    .fn()
    .mockResolvedValue({ rule: null, reason: "AI decision" }),
}));

vi.mock("@/utils/prisma", () => ({
  newsletter: {
    findUnique: vi.fn().mockResolvedValue({ categoryId: "test-category" }),
  },
}));

describe("findMatchingRule", () => {
  it("matches a static rule", async () => {
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
    ...overrides,
  };

  return message as ParsedMessage;
}
