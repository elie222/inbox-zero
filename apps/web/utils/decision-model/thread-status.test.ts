import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTestLogger,
  getEmail,
  getEmailAccount,
} from "@/__tests__/helpers";
import { SystemType } from "@/generated/prisma/enums";

const runDecisionModelMock = vi.hoisted(() => vi.fn());
vi.mock("./decision-model", () => ({
  runDecisionModel: runDecisionModelMock,
}));

import { decideThreadStatus } from "./thread-status";

const config = {
  provider: "typesafe" as const,
  model: "jev-latest",
  apiKey: "key",
};
const definitions = [
  { systemType: SystemType.TO_REPLY, instructions: "The user owes a reply." },
  {
    systemType: SystemType.AWAITING_REPLY,
    instructions: "Another participant owes a reply.",
  },
  { systemType: SystemType.ACTIONED, instructions: "No reply is pending." },
];

describe("decideThreadStatus", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a valid high-confidence status", async () => {
    runDecisionModelMock.mockResolvedValue({
      answers: {
        thread_status: {
          type: "choice",
          choice: SystemType.TO_REPLY,
          confidence: 0.85,
          probabilities: {},
        },
      },
    });

    const result = await decideThreadStatus({
      config,
      emailAccount: getEmailAccount(),
      definitions,
      threadMessages: [getEmail({ content: "Can you send the report?" })],
      userSentLastEmail: false,
      logger: createTestLogger(),
    });

    expect(result.status).toBe(SystemType.TO_REPLY);
    expect(result.rationale).toContain("85% confidence");
  });

  it("rejects a low-confidence status so the caller can use the LLM", async () => {
    runDecisionModelMock.mockResolvedValue({
      answers: {
        thread_status: {
          type: "choice",
          choice: SystemType.ACTIONED,
          confidence: 0.59,
          probabilities: {},
        },
      },
    });

    await expect(
      decideThreadStatus({
        config,
        emailAccount: getEmailAccount(),
        definitions,
        threadMessages: [getEmail()],
        userSentLastEmail: false,
        logger: createTestLogger(),
      }),
    ).rejects.toThrow("confidence is too low");
  });
});
