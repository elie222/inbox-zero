import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";

const envMock = vi.hoisted(() => ({
  RECALL_API_KEY: "recall-api-key",
  RECALL_BASE_URL: undefined as string | undefined,
  RECALL_REGION: "eu-central-1",
}));
const readFileMock = vi.hoisted(() => vi.fn());

vi.mock("@/env", () => ({ env: envMock }));
vi.mock("node:fs/promises", () => ({ readFile: readFileMock }));

describe("RecallBotProvider", () => {
  beforeEach(() => {
    vi.resetModules();
    readFileMock.mockReset();
    readFileMock.mockResolvedValue("camera-image");
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
    const { RecallBotProvider } = await import("@/utils/recall/client");
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

  it("retries loading the camera image after a transient failure", async () => {
    const readError = Object.assign(new Error("Temporary read failure"), {
      code: "EIO",
    });
    readFileMock
      .mockRejectedValueOnce(readError)
      .mockResolvedValue("camera-image");

    const { RecallBotProvider } = await import("@/utils/recall/client");
    const provider = new RecallBotProvider(createTestLogger());
    const bot = {
      meetingUrl: "https://meet.google.com/abc-defg-hij",
      joinAt: new Date("2026-05-04T09:00:00.000Z"),
    };

    await expect(provider.scheduleBot(bot)).rejects.toThrow(
      "Temporary read failure",
    );
    await expect(provider.scheduleBot(bot)).resolves.toEqual({
      externalBotId: "bot-1",
    });

    expect(readFileMock).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
