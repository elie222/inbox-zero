import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTestLogger,
  getEmail,
  getEmailAccount,
} from "@/__tests__/helpers";

const runDecisionModelMock = vi.hoisted(() => vi.fn());
vi.mock("./decision-model", () => ({
  runDecisionModel: runDecisionModelMock,
}));

import { decideRecurringPattern } from "./recurring-pattern";

const config = {
  provider: "typesafe" as const,
  model: "jev-latest",
  apiKey: "key",
};
const rules = [
  { name: "Receipts", instructions: "Payment receipts" },
  { name: "Newsletters", instructions: "Recurring newsletters" },
];

describe("decideRecurringPattern", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the strongest rule above the conservative threshold", async () => {
    runDecisionModelMock.mockResolvedValue({
      answers: {
        rule_0: { type: "yesNo", probability: 0.93 },
        rule_1: { type: "yesNo", probability: 0.4 },
      },
    });

    const result = await decideRecurringPattern({
      config,
      emails: [getEmail({ from: "receipts@example.com" })],
      emailAccount: getEmailAccount(),
      rules,
      logger: createTestLogger(),
    });

    expect(result.matchedRule).toBe("Receipts");
  });

  it("returns no match below 90 percent", async () => {
    runDecisionModelMock.mockResolvedValue({
      answers: {
        rule_0: { type: "yesNo", probability: 0.89 },
        rule_1: { type: "yesNo", probability: 0.2 },
      },
    });

    const result = await decideRecurringPattern({
      config,
      emails: [getEmail({ from: "person@example.com" })],
      emailAccount: getEmailAccount(),
      rules,
      logger: createTestLogger(),
    });

    expect(result.matchedRule).toBeNull();
  });

  it("does not call the provider when the historical rule no longer exists", async () => {
    const result = await decideRecurringPattern({
      config,
      emails: [getEmail({ from: "person@example.com" })],
      emailAccount: getEmailAccount(),
      rules,
      consistentRuleName: "Deleted rule",
      logger: createTestLogger(),
    });

    expect(result.matchedRule).toBeNull();
    expect(runDecisionModelMock).not.toHaveBeenCalled();
  });
});
