import { beforeEach, describe, expect, it, vi } from "vitest";
import { decideWithSystemOne } from "./system-one";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

describe.each([
  {
    provider: "typesafe" as const,
    model: "jev-latest",
    endpoint: "https://api.typesafe.ai/v1/systemone",
  },
  {
    provider: "openrouter" as const,
    model: "typesafe/jev-1.13",
    endpoint: "https://openrouter.ai/api/v1/systemone",
  },
])("decideWithSystemOne ($provider)", ({ provider, model, endpoint }) => {
  const config = { provider, model, apiKey: "test-key" };

  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("translates structured choice and yes/no questions and answers", async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        model,
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

    const result = await decideWithSystemOne({
      config,
      state: { text: "hello" },
      questions: {
        label: {
          type: "choice",
          instructions: "Pick one",
          criteria: { A: "a", B: "b" },
        },
        applies: {
          type: "yesNo",
          instructions: "Does it apply?",
          criteria: { true: "It applies", false: "It does not apply" },
        },
      },
    });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(endpoint);
    expect(init.headers.Authorization).toBe("Bearer test-key");
    expect(JSON.parse(init.body)).toEqual({
      model,
      state: { text: "hello" },
      questions: {
        label: {
          type: "choice",
          instructions: "Pick one",
          criteria: { A: "a", B: "b" },
        },
        applies: {
          type: "noul",
          instructions: "Does it apply?",
          criteria: { true: "It applies", false: "It does not apply" },
        },
      },
    });
    expect(result).toEqual({
      model,
      inputTokens: 12,
      outputTokens: 1,
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

  it("rejects probabilities outside 0 to 1", async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        model,
        usage: { input_tokens: 1, output_tokens: 1 },
        answers: { applies: { type: "noul", noul: 2 } },
      }),
    );

    await expect(
      decideWithSystemOne({ config, state: {}, questions: {} }),
    ).rejects.toThrow();
  });

  it("throws on an error status", async () => {
    fetchMock.mockResolvedValue(new Response("rate limited", { status: 429 }));

    await expect(
      decideWithSystemOne({ config, state: {}, questions: {} }),
    ).rejects.toThrow("status 429");
  });

  it("defaults omitted output usage to zero without losing input usage", async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        model,
        usage: { input_tokens: 42 },
        answers: { applies: { type: "noul", noul: 0 } },
      }),
    );

    await expect(
      decideWithSystemOne({ config, state: {}, questions: {} }),
    ).resolves.toEqual({
      model,
      inputTokens: 42,
      outputTokens: 0,
      answers: { applies: { type: "yesNo", probability: 0 } },
    });
  });

  it("rejects a malformed choice rather than returning an actionable decision", async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        model,
        usage: { input_tokens: 1 },
        answers: {
          label: {
            type: "choice",
            choice: "A",
            confidence: 0.9,
            probabilities: { A: -0.1 },
          },
        },
      }),
    );

    await expect(
      decideWithSystemOne({ config, state: {}, questions: {} }),
    ).rejects.toThrow();
  });

  it("propagates a network failure instead of returning an empty decision", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    await expect(
      decideWithSystemOne({ config, state: {}, questions: {} }),
    ).rejects.toThrow("fetch failed");
  });
});
