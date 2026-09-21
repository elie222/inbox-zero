import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger, getEmailAccount } from "@/__tests__/helpers";

const runDecisionModelMock = vi.hoisted(() => vi.fn());
vi.mock("./decision-model", () => ({
  runDecisionModel: runDecisionModelMock,
}));

import { decideUnsubscribePageState } from "./unsubscribe-page";

const config = {
  provider: "typesafe" as const,
  model: "jev-latest",
  apiKey: "key",
};

describe("decideUnsubscribePageState", () => {
  beforeEach(() => vi.clearAllMocks());

  it("confirms only at the conservative threshold", async () => {
    runDecisionModelMock.mockResolvedValue({
      answers: {
        unsubscribe_confirmed: { type: "yesNo", probability: 0.89 },
      },
    });

    const result = await decideUnsubscribePageState({
      config,
      pageText: "You have been removed.",
      emailAccount: getEmailAccount(),
      logger: createTestLogger(),
    });

    expect(result).toBe("not_confirmed");
  });

  it("accepts a high-confidence confirmation", async () => {
    runDecisionModelMock.mockResolvedValue({
      answers: {
        unsubscribe_confirmed: { type: "yesNo", probability: 0.97 },
      },
    });

    const result = await decideUnsubscribePageState({
      config,
      pageText: "You have been removed.",
      emailAccount: getEmailAccount(),
      logger: createTestLogger(),
    });

    expect(result).toBe("confirmed");
  });
});
