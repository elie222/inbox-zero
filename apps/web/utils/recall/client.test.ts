import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";

const envMock = vi.hoisted(() => ({
  RECALL_API_KEY: "recall-api-key",
  RECALL_BASE_URL: undefined as string | undefined,
  RECALL_REGION: "eu-central-1",
}));

vi.mock("@/env", () => ({ env: envMock }));

import { RecallBotProvider } from "@/utils/recall/client";

describe("RecallBotProvider", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "bot-1" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the configured Recall workspace region", async () => {
    const provider = new RecallBotProvider(createTestLogger());

    await provider.scheduleBot({
      meetingUrl: "https://meet.google.com/abc-defg-hij",
      joinAt: new Date("2026-05-04T09:00:00.000Z"),
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://eu-central-1.recall.ai/api/v1/bot/",
      expect.anything(),
    );
  });

  it("removes a dispatched bot from its call when Recall rejects deletion with 405", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: "Method not allowed." }), {
          status: 405,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const provider = new RecallBotProvider(createTestLogger());

    await expect(provider.cancelBot("bot-1")).resolves.toBeUndefined();
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "https://eu-central-1.recall.ai/api/v1/bot/bot-1/leave_call/",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
