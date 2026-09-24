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

import { decideColdEmail } from "./cold-email";

const config = {
  provider: "typesafe" as const,
  model: "jev-latest",
  apiKey: "key",
};

describe("decideColdEmail", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires a strong cold-outreach probability", async () => {
    runDecisionModelMock.mockResolvedValue({
      answers: { cold_email: { type: "yesNo", probability: 0.74 } },
    });

    const result = await decideColdEmail({
      config,
      email: getEmail(),
      emailAccount: getEmailAccount(),
      coldEmailRule: null,
      logger: createTestLogger(),
    });

    expect(result.coldEmail).toBe(false);
  });

  it("classifies high-confidence outreach as cold", async () => {
    runDecisionModelMock.mockResolvedValue({
      answers: { cold_email: { type: "yesNo", probability: 0.95 } },
    });

    const result = await decideColdEmail({
      config,
      email: getEmail(),
      emailAccount: getEmailAccount(),
      coldEmailRule: null,
      logger: createTestLogger(),
    });

    expect(result.coldEmail).toBe(true);
  });
});
