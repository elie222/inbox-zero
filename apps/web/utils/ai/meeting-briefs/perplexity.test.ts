import { afterEach, describe, expect, it, vi } from "vitest";
import { generateText } from "ai";
import { createPerplexityResearchModel } from "./perplexity";

const fetchMock = vi.fn();
afterEach(() => vi.unstubAllGlobals());

describe("Perplexity meeting research transport", () => {
  it("uses web-grounded Agent API research and maps text, tokens and cost", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValueOnce(
      Response.json({
        id: "response-test",
        status: "completed",
        model: "test/resolved-model",
        output: [
          {
            type: "search_results",
            results: [{ id: 1, url: "https://example.org" }],
          },
          {
            type: "message",
            content: [{ type: "output_text", text: "Research [1]" }],
          },
        ],
        usage: {
          input_tokens: 100,
          input_tokens_details: { cached_tokens: 20 },
          output_tokens: 30,
          output_tokens_details: { reasoning_tokens: 10 },
          cost: { total_cost: 0.012 },
        },
      }),
    );

    const result = await generateText({
      model: createPerplexityResearchModel("test-key"),
      instructions: "Existing hardened instructions",
      prompt: "Research Example Organization",
      maxRetries: 0,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.perplexity.ai/v1/agent",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer test-key",
          "Content-Type": "application/json",
        },
      }),
    );
    expect(JSON.parse(fetchMock.mock.calls.at(-1)![1].body)).toEqual({
      effort: "fast",
      instructions: "Existing hardened instructions",
      input: [
        {
          type: "message",
          role: "user",
          content: "Research Example Organization",
        },
      ],
    });
    expect(result.text).toBe("Research [1]");
    expect(result.usage).toMatchObject({
      inputTokens: 100,
      outputTokens: 30,
      totalTokens: 130,
      inputTokenDetails: { cacheReadTokens: 20 },
      outputTokenDetails: { reasoningTokens: 10 },
    });
    expect(result.providerMetadata).toEqual({
      perplexity: { cost: 0.012, model: "test/resolved-model" },
    });
  });

  it.each([
    { status: "failed", output: [], usage: {} },
    { status: "incomplete", output: [], usage: {} },
    { choices: [{ message: { content: "Legacy response" } }] },
  ])("rejects failed, incomplete or legacy responses", async (body) => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValueOnce(Response.json(body));
    await expect(
      generateText({
        model: createPerplexityResearchModel("test-key"),
        prompt: "Synthetic research",
        maxRetries: 0,
      }),
    ).rejects.toThrow();
  });

  it("does not expose provider error bodies in errors", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValueOnce(
      new Response("untrusted provider error content", { status: 400 }),
    );
    await expect(
      generateText({
        model: createPerplexityResearchModel("test-key"),
        prompt: "Synthetic research",
        maxRetries: 0,
      }),
    ).rejects.toThrow("Perplexity research request failed (400)");
  });
});
