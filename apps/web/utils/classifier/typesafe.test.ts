import { beforeEach, describe, expect, it, vi } from "vitest";
import { classifyWithTypeSafe } from "./typesafe";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const config = {
  provider: "typesafe" as const,
  model: "test-model",
  apiKey: "test-key",
};

describe("classifyWithTypeSafe", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("translates yes/no questions and answers to and from the TypeSafe format", async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        model: "test-model",
        usage: { input_tokens: 12, output_tokens: 1 },
        answers: {
          label: {
            type: "choice",
            choice: "A",
            confidence: 0.8,
            probabilities: { A: 0.8, B: 0.2 },
          },
          applies: { type: "noul", noul: 0.7 },
        },
      }),
    );

    const result = await classifyWithTypeSafe({
      config,
      state: { text: "hello" },
      questions: {
        label: {
          type: "choice",
          instructions: "Pick one",
          criteria: { A: "a", B: "b" },
        },
        applies: { type: "yesNo", instructions: "Does it apply?" },
      },
    });

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(init.headers.Authorization).toBe("Bearer test-key");
    expect(JSON.parse(init.body)).toEqual({
      model: "test-model",
      state: { text: "hello" },
      questions: {
        label: {
          type: "choice",
          instructions: "Pick one",
          criteria: { A: "a", B: "b" },
        },
        applies: { type: "noul", instructions: "Does it apply?" },
      },
    });
    expect(result).toEqual({
      model: "test-model",
      inputTokens: 12,
      answers: {
        label: {
          type: "choice",
          choice: "A",
          confidence: 0.8,
          probabilities: { A: 0.8, B: 0.2 },
        },
        applies: { type: "yesNo", probability: 0.7 },
      },
    });
  });

  it("throws on an error status", async () => {
    fetchMock.mockResolvedValue(new Response("rate limited", { status: 429 }));

    await expect(
      classifyWithTypeSafe({ config, state: {}, questions: {} }),
    ).rejects.toThrow("status 429");
  });
});
