import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import {
  createRecallEmulator,
  type RecallEmulator,
  type RecallEmulatorTranscriptTurn,
} from "@/__tests__/emulators/recall";

vi.mock("server-only", () => ({}));

const envMock = vi.hoisted(() => ({
  RECALL_API_KEY: "emulator-recall-key",
  RECALL_BASE_URL: "",
}));

vi.mock("@/env", () => ({ env: envMock }));

const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS;

describe.skipIf(!RUN_INTEGRATION_TESTS)(
  "RecallBotProvider against the Recall emulator",
  { timeout: 30_000 },
  () => {
    let emulator: RecallEmulator;
    let provider: import("@/utils/recall/client").RecallBotProvider;

    beforeAll(async () => {
      emulator = await createRecallEmulator();
      envMock.RECALL_BASE_URL = emulator.apiBase;
      envMock.RECALL_API_KEY = emulator.apiKey;

      const { RecallBotProvider } = await import("@/utils/recall/client");
      provider = new RecallBotProvider(createTestLogger());
    });

    beforeEach(() => emulator.reset());

    afterAll(() => emulator?.close());

    test("schedules a bot with the branded name and diarized transcription", async () => {
      const joinAt = new Date("2026-05-04T09:00:00.000Z");

      const { externalBotId } = await provider.scheduleBot({
        meetingUrl: "https://meet.google.com/abc-defg-hij",
        joinAt,
      });

      expect(emulator.getBot(externalBotId)).toMatchObject({
        meeting_url: "https://meet.google.com/abc-defg-hij",
        bot_name: "Inbox Zero Notetaker",
        join_at: joinAt.toISOString(),
      });

      const create = emulator.requests.find((r) => r.method === "POST");
      expect(create?.authorization).toBe(`Token ${emulator.apiKey}`);
      expect(create?.body).toMatchObject({
        recording_config: {
          transcript: {
            provider: {
              recallai_async: {
                diarization: { use_separate_streams_when_available: true },
              },
            },
          },
        },
      });
    });

    test("moves a scheduled bot to a new start time", async () => {
      const { externalBotId } = await provider.scheduleBot({
        meetingUrl: "https://meet.google.com/abc-defg-hij",
        joinAt: new Date("2026-05-04T09:00:00.000Z"),
      });

      const movedTo = new Date("2026-05-04T10:00:00.000Z");
      await provider.rescheduleBot(externalBotId, { joinAt: movedTo });

      expect(emulator.getBot(externalBotId)?.join_at).toBe(
        movedTo.toISOString(),
      );
    });

    test("cancels a scheduled bot", async () => {
      const { externalBotId } = await provider.scheduleBot({
        meetingUrl: "https://meet.google.com/abc-defg-hij",
        joinAt: new Date("2026-05-04T09:00:00.000Z"),
      });

      await provider.cancelBot(externalBotId);

      expect(emulator.getBot(externalBotId)).toBeUndefined();
    });

    test("treats cancelling an unknown or already-joined bot as a no-op", async () => {
      await expect(provider.cancelBot("bot_missing")).resolves.toBeUndefined();

      const { externalBotId } = await provider.scheduleBot({
        meetingUrl: "https://meet.google.com/abc-defg-hij",
        joinAt: new Date("2026-05-04T09:00:00.000Z"),
      });
      emulator.advance(externalBotId, "in_call_recording");

      // The bot is in the call, so Recall refuses the delete. A reconciler pass
      // must not blow up over that.
      await expect(provider.cancelBot(externalBotId)).resolves.toBeUndefined();
      expect(emulator.getBot(externalBotId)).toBeDefined();
    });

    test("fetches a fresh download URL and normalizes the transcript", async () => {
      const { externalBotId } = await provider.scheduleBot({
        meetingUrl: "https://meet.google.com/abc-defg-hij",
        joinAt: new Date("2026-05-04T09:00:00.000Z"),
      });
      const transcriptId = emulator.attachTranscript(externalBotId, TURNS);

      const transcript = await provider.fetchTranscript(transcriptId);

      expect(transcript).toEqual([
        {
          speakerName: "Alice",
          isHost: true,
          email: "alice@example.com",
          startTime: 0,
          endTime: 0.9,
          text: "Let's start",
        },
        {
          speakerName: "Bob",
          isHost: false,
          email: undefined,
          startTime: 1,
          endTime: 1.8,
          text: "Sounds good",
        },
      ]);

      // The URL is short-lived, so the client must read it back rather than
      // reuse anything it was handed earlier.
      expect(
        emulator.requests.some((r) =>
          r.path.startsWith(`/api/v1/transcript/${transcriptId}`),
        ),
      ).toBe(true);
      expect(
        emulator.requests.some((r) => r.path.startsWith("/download/")),
      ).toBe(true);
    });

    test("deletes media and tolerates media that is already gone", async () => {
      const { externalBotId } = await provider.scheduleBot({
        meetingUrl: "https://meet.google.com/abc-defg-hij",
        joinAt: new Date("2026-05-04T09:00:00.000Z"),
      });

      await provider.deleteMedia(externalBotId);
      expect(emulator.getBot(externalBotId)?.media_deleted).toBe(true);

      await expect(
        provider.deleteMedia("bot_missing"),
      ).resolves.toBeUndefined();
    });

    test("marks a rejected meeting link as permanent so the claim is dropped", async () => {
      const error = await provider
        .scheduleBot({
          meetingUrl: "not-a-url",
          joinAt: new Date("2026-05-04T09:00:00.000Z"),
        })
        .catch((caught) => caught);

      expect(error).toBeInstanceOf(Error);
      expect(error.permanent).toBe(true);
    });

    test("rejects calls that are missing the API token", async () => {
      const previousKey = envMock.RECALL_API_KEY;
      envMock.RECALL_API_KEY = "wrong-key";

      const error = await provider
        .scheduleBot({
          meetingUrl: "https://meet.google.com/abc-defg-hij",
          joinAt: new Date("2026-05-04T09:00:00.000Z"),
        })
        .catch((caught) => caught);

      envMock.RECALL_API_KEY = previousKey;

      expect(error.status).toBe(401);
    });
  },
);

const TURNS: RecallEmulatorTranscriptTurn[] = [
  {
    participant: {
      id: 1,
      name: "Alice",
      is_host: true,
      email: "alice@example.com",
    },
    words: [
      {
        text: "Let's",
        start_timestamp: { relative: 0 },
        end_timestamp: { relative: 0.4 },
      },
      {
        text: "start",
        start_timestamp: { relative: 0.4 },
        end_timestamp: { relative: 0.9 },
      },
    ],
  },
  {
    participant: { id: 2, name: "Bob", is_host: false, email: null },
    words: [
      {
        text: "Sounds",
        start_timestamp: { relative: 1 },
        end_timestamp: { relative: 1.4 },
      },
      {
        text: "good",
        start_timestamp: { relative: 1.4 },
        end_timestamp: { relative: 1.8 },
      },
    ],
  },
];
