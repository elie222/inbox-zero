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
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-04T08:00:00.000Z"));
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
    vi.useRealTimers();
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

  it("leaves promptly when only other meeting bots remain", async () => {
    const { RecallBotProvider } = await import("@/utils/recall/client");
    const provider = new RecallBotProvider(createTestLogger());

    await provider.scheduleBot({
      meetingUrl: "https://meet.google.com/abc-defg-hij",
      joinAt: new Date("2026-05-04T09:00:00.000Z"),
    });

    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    const botDetection = JSON.parse(request?.body as string).automatic_leave
      ?.bot_detection;
    expect(botDetection.using_participant_names.matches).toContain("notetaker");
    expect(
      botDetection.using_participant_names.activate_after,
    ).toBeGreaterThanOrEqual(1);
    expect(botDetection.using_participant_names.timeout).toBeGreaterThanOrEqual(
      10,
    );
    expect(
      botDetection.using_participant_events.activate_after,
    ).toBeGreaterThan(0);
  });

  it("joins an ongoing meeting immediately instead of sending a past join time", async () => {
    const { RecallBotProvider } = await import("@/utils/recall/client");
    const provider = new RecallBotProvider(createTestLogger());

    await provider.scheduleBot({
      meetingUrl: "https://meet.google.com/abc-defg-hij",
      joinAt: new Date("2026-05-04T07:55:00.000Z"),
    });

    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    expect(JSON.parse(request?.body as string)).not.toHaveProperty("join_at");
  });

  it("removes a dispatched bot from the call after Recall rejects deletion", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: "cannot_delete_bot",
            detail:
              "Only scheduled bots which have not joined a call can be deleted.",
          }),
          {
            status: 405,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const { RecallBotProvider } = await import("@/utils/recall/client");
    const provider = new RecallBotProvider(createTestLogger());

    await expect(provider.cancelBot("bot-1")).resolves.toBeUndefined();
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "https://eu-central-1.recall.ai/api/v1/bot/bot-1/",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "https://eu-central-1.recall.ai/api/v1/bot/bot-1/leave_call/",
      expect.objectContaining({ method: "POST" }),
    );
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
    const requestBody = JSON.parse(request?.body as string);
    expect(requestBody).toMatchObject({
      meeting_url: "https://meet.google.com/abc-defg-hij",
      bot_name: "Inbox Zero Notetaker",
      join_at: "2026-05-04T09:00:00.000Z",
    });
    expect(requestBody).not.toHaveProperty("automatic_video_output");
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
