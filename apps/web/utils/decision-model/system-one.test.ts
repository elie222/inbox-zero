import { experimental_decide } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSystemOneDecisionModel } from "./system-one";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const model = createSystemOneDecisionModel({
  provider: "openrouter",
  url: "https://example.com/decisions",
  apiKey: "test-key",
  modelId: "test/model",
});

const questions = {
  label: {
    type: "choice",
    instructions: "Pick one",
    criteria: { A: "a", B: "b", C: "c" },
  },
  applies: {
    type: "boolean",
    instructions: "Does it apply?",
    criteria: { true: "It applies", false: "It does not apply" },
  },
} as const;

describe("createSystemOneDecisionModel", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("translates questions and answers to and from the System One format", async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        id: "gen-dec-1",
        model: "test/model-20260101",
        answers: {
          label: {
            type: "choice",
            choice: "A",
            confidence: 0.97,
            // Rounded: sums to 0.9999
            probabilities: { A: 0.9908, B: 0.0037, C: 0.0054 },
          },
          applies: { type: "noul", noul: 0.7 },
        },
        usage: { input_tokens: 12, output_tokens: 0, cost: 0.000_05 },
      }),
    );

    const result = await experimental_decide({
      model,
      state: { text: "hello" },
      questions,
    });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://example.com/decisions");
    expect(init.headers.Authorization).toBe("Bearer test-key");
    expect(JSON.parse(init.body)).toEqual({
      model: "test/model",
      state: { text: "hello" },
      questions: {
        label: questions.label,
        applies: { ...questions.applies, type: "noul" },
      },
    });

    expect(result.answers).toEqual({
      label: {
        type: "choice",
        choice: "A",
        probabilities: { A: 0.9908, B: 0.0037, C: 0.0054 },
      },
      applies: { type: "boolean", probability: 0.7 },
    });
    expect(result.usage).toMatchObject({ inputTokens: 12, outputTokens: 0 });
    expect(result.providerMetadata).toEqual({
      openrouter: { usage: { cost: 0.000_05 }, confidence: { label: 0.97 } },
    });
    expect(result.response).toMatchObject({
      id: "gen-dec-1",
      modelId: "test/model-20260101",
    });
  });

  it("rejects probabilities outside 0 to 1", async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        model: "test/model",
        usage: { input_tokens: 1, output_tokens: 1 },
        answers: { applies: { type: "noul", noul: 2 } },
      }),
    );

    await expect(
      experimental_decide({
        model,
        state: {},
        questions: { applies: questions.applies },
      }),
    ).rejects.toThrow();
  });

  it("keeps email content out of request errors", async () => {
    fetchMock.mockResolvedValue(new Response("rate limited", { status: 429 }));

    const error = await experimental_decide({
      model,
      state: { content: "private email body" },
      questions: { applies: questions.applies },
      maxRetries: 0,
    }).catch((error: unknown) => error);

    expect(error).toMatchObject({ statusCode: 429 });
    expect(JSON.stringify(error)).not.toContain("private email body");
  });
});
