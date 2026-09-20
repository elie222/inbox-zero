import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger, getEmailAccount } from "@/__tests__/helpers";

const runDecisionModelMock = vi.hoisted(() => vi.fn());
vi.mock("./decision-model", () => ({
  runDecisionModel: runDecisionModelMock,
}));

import {
  decideBulkSenderCategories,
  decideSenderCategory,
} from "./categorize-sender";

const config = {
  provider: "typesafe" as const,
  model: "jev-latest",
  apiKey: "key",
};
const categories = [
  { name: "Newsletter", description: "Editorial subscription email" },
  { name: "Receipt", description: "Purchase receipt" },
];

describe("sender categorization decisions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("maps an opaque choice key back to the category", async () => {
    runDecisionModelMock.mockResolvedValue({
      answers: {
        sender_0: {
          type: "choice",
          choice: "category_1",
          confidence: 0.9,
          probabilities: {},
        },
      },
    });

    const result = await decideSenderCategory({
      config,
      emailAccount: getEmailAccount(),
      sender: "billing@example.com",
      previousEmails: [{ subject: "Your receipt", snippet: "$20 paid" }],
      categories,
      logger: createTestLogger(),
    });

    expect(result?.category).toBe("Receipt");
  });

  it("leaves uncertain bulk results uncategorized", async () => {
    runDecisionModelMock.mockResolvedValue({
      answers: {
        sender_0: {
          type: "choice",
          choice: "category_0",
          confidence: 0.8,
          probabilities: {},
        },
        sender_1: {
          type: "choice",
          choice: "category_1",
          confidence: 0.4,
          probabilities: {},
        },
      },
    });

    const result = await decideBulkSenderCategories({
      config,
      emailAccount: getEmailAccount(),
      senders: [
        { emailAddress: "news@example.com", emails: [] },
        { emailAddress: "unknown@example.com", emails: [] },
      ],
      categories,
      logger: createTestLogger(),
    });

    expect(result).toEqual([
      { sender: "news@example.com", category: "Newsletter" },
      { sender: "unknown@example.com", category: undefined },
    ]);
  });
});
