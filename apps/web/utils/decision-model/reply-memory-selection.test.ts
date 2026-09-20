import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger, getEmailAccount } from "@/__tests__/helpers";
import {
  ReplyMemoryKind,
  ReplyMemoryScopeType,
} from "@/generated/prisma/enums";

const runDecisionModelMock = vi.hoisted(() => vi.fn());
vi.mock("./decision-model", () => ({
  runDecisionModel: runDecisionModelMock,
}));

import { decideRelevantReplyMemories } from "./reply-memory-selection";

const config = {
  provider: "typesafe" as const,
  model: "jev-latest",
  apiKey: "key",
};
const candidates = Array.from({ length: 8 }, (_, index) => ({
  id: `memory-${index}`,
  content: `Memory ${index}`,
  kind: ReplyMemoryKind.FACT,
  scopeType: ReplyMemoryScopeType.GLOBAL,
  scopeValue: "",
}));

describe("decideRelevantReplyMemories", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ranks qualifying memories by probability and limits the result", async () => {
    runDecisionModelMock.mockResolvedValue({
      answers: Object.fromEntries(
        [0.7, 0.1, 0.95, 0.8, 0.65, 0.6, 0.55, 0.5].map(
          (probability, index) => [
            `memory_${index}`,
            { type: "yesNo", probability },
          ],
        ),
      ),
    });

    const result = await decideRelevantReplyMemories({
      config,
      candidates,
      emailContent: "What is your pricing?",
      emailAccount: getEmailAccount(),
      logger: createTestLogger(),
    });

    expect(result).toEqual([
      "memory-2",
      "memory-3",
      "memory-0",
      "memory-4",
      "memory-5",
      "memory-6",
    ]);
  });

  it("returns no memories when none clear the threshold", async () => {
    runDecisionModelMock.mockResolvedValue({
      answers: { memory_0: { type: "yesNo", probability: 0.2 } },
    });

    const result = await decideRelevantReplyMemories({
      config,
      candidates: candidates.slice(0, 1),
      emailContent: "Thanks",
      emailAccount: getEmailAccount(),
      logger: createTestLogger(),
    });

    expect(result).toEqual([]);
  });
});
