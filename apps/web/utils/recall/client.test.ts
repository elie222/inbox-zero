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
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
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
      botName: "Barbara's Inbox Zero Notetaker",
      meetingUrl: "https://meet.google.com/abc-defg-hij",
      joinAt: new Date("2026-05-04T09:00:00.000Z"),
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://eu-central-1.recall.ai/api/v1/bot/",
      expect.anything(),
    );
    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    expect(JSON.parse(request?.body as string)).toMatchObject({
      bot_name: "Barbara's Inbox Zero Notetaker",
    });
  });

  it("schedules the bot without video when the camera image cannot be loaded", async () => {
    const readError = Object.assign(new Error("Temporary read failure"), {
      code: "EIO",
    });
    readFileMock.mockRejectedValue(readError);

    const { RecallBotProvider } = await import("@/utils/recall/client");
    const provider = new RecallBotProvider(createTestLogger());

    await expect(
      provider.scheduleBot({
        meetingUrl: "https://meet.google.com/abc-defg-hij",
        joinAt: new Date("2026-05-04T09:00:00.000Z"),
      }),
    ).resolves.toEqual({
      externalBotId: "bot-1",
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    expect(JSON.parse(request?.body as string)).toEqual({
      meeting_url: "https://meet.google.com/abc-defg-hij",
      bot_name: "Inbox Zero Notetaker",
      join_at: "2026-05-04T09:00:00.000Z",
    });
  });

  it("retries loading the camera image for the next bot", async () => {
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

    await expect(provider.scheduleBot(bot)).resolves.toEqual({
      externalBotId: "bot-1",
    });
    await expect(provider.scheduleBot(bot)).resolves.toEqual({
      externalBotId: "bot-1",
    });

    expect(readFileMock).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledTimes(2);
    const secondRequest = vi.mocked(fetch).mock.calls[1]?.[1];
    expect(JSON.parse(secondRequest?.body as string)).toMatchObject({
      automatic_video_output: {
        in_call_recording: {
          kind: "jpeg",
          b64_data: "camera-image",
        },
      },
    });
  });
});
