import {
  afterAll,
  afterEach,
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
import { MEETING_BOT_DISPLAY_NAME } from "@/utils/meeting-recorder/bot-provider";

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

    beforeEach(() => {
      emulator.reset();
      vi.spyOn(Date, "now").mockReturnValue(
        new Date("2026-05-04T08:00:00.000Z").getTime(),
      );
    });

    afterEach(() => vi.restoreAllMocks());

    afterAll(() => emulator?.close());

    test("schedules a bot with branded name and camera image", async () => {
      const joinAt = new Date("2026-05-04T09:00:00.000Z");

      const { externalBotId } = await provider.scheduleBot({
        botName: "Barbara's Inbox Zero Notetaker",
        meetingUrl: "https://meet.google.com/abc-defg-hij",
        joinAt,
      });

      expect(emulator.getBot(externalBotId)).toMatchObject({
        meeting_url: "https://meet.google.com/abc-defg-hij",
        bot_name: "Barbara's Inbox Zero Notetaker",
        join_at: joinAt.toISOString(),
      });

      const create = emulator.requests.find((r) => r.method === "POST");
      expect(create?.authorization).toBe(`Token ${emulator.apiKey}`);
      expect(create?.body).toMatchObject({
        automatic_video_output: {
          in_call_recording: {
            kind: "jpeg",
            b64_data: expect.any(String),
          },
        },
      });

      const cameraImage = (
        create?.body as {
          automatic_video_output?: {
            in_call_recording?: { b64_data?: string };
          };
        }
      )?.automatic_video_output?.in_call_recording?.b64_data;
      const jpeg = Buffer.from(cameraImage ?? "", "base64");
      expect(jpeg.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
      expect(jpeg.byteLength).toBeLessThan(1_300_000);

      // `recallai_async` is not a bot-creation provider, so no transcript
      // config belongs here. Sending one would be rejected or ignored, and
      // either way no transcript would ever be produced.
      expect(create?.body).not.toHaveProperty("recording_config");
    });

    test("requests async transcription for a finished recording", async () => {
      const { externalBotId } = await provider.scheduleBot({
        meetingUrl: "https://meet.google.com/abc-defg-hij",
        joinAt: new Date("2026-05-04T09:00:00.000Z"),
      });
      const recordingId = emulator.getBot(externalBotId)?.recording_id ?? "";
      emulator.attachTranscript(externalBotId, TURNS);

      await provider.createTranscript(recordingId);

      const request = emulator.requests.find((r) =>
        r.path.endsWith(`/recording/${recordingId}/create_transcript/`),
      );
      expect(request?.method).toBe("POST");
      expect(request?.body).toEqual({
        provider: { recallai_async: { language_code: "auto" } },
        // Diarization sits at the top level for the async provider, not inside
        // the provider object as it does for real-time at bot creation.
        diarization: { use_separate_streams_when_available: true },
      });
      expect(emulator.transcriptRequested(externalBotId)).toBe(true);
    });

    test("produces no transcript until transcription has been requested", async () => {
      const { externalBotId } = await provider.scheduleBot({
        meetingUrl: "https://meet.google.com/abc-defg-hij",
        joinAt: new Date("2026-05-04T09:00:00.000Z"),
      });
      const transcriptId = emulator.attachTranscript(externalBotId, TURNS);

      // This is the bug the original implementation had: the bot was created
      // with an async transcript config and nothing ever asked for the
      // transcript, so this fetch is all the user would have got.
      await expect(provider.fetchTranscript(transcriptId)).rejects.toThrow();
    });

    test("moves a scheduled bot to a new start time", async () => {
      const { externalBotId } = await provider.scheduleBot({
        meetingUrl: "https://meet.google.com/abc-defg-hij",
        joinAt: new Date("2026-05-04T09:00:00.000Z"),
      });

      const movedTo = new Date("2026-05-04T10:00:00.000Z");
      await provider.updateBot(externalBotId, {
        botName: MEETING_BOT_DISPLAY_NAME,
        joinAt: movedTo,
        meetingUrl: "https://meet.google.com/abc-defg-hij",
      });

      expect(emulator.getBot(externalBotId)?.join_at).toBe(
        movedTo.toISOString(),
      );
    });

    test("replaces a bot when Recall rejects a near-term reschedule", async () => {
      const meetingUrl = "https://meet.google.com/abc-defg-hij";
      const botName = "Barbara's Inbox Zero Notetaker";
      const { externalBotId } = await provider.scheduleBot({
        botName,
        meetingUrl,
        joinAt: new Date("2026-05-04T09:00:00.000Z"),
      });
      emulator.rejectNextJoinAtUpdate();

      const movedTo = new Date("2026-05-04T08:05:00.000Z");
      const updated = await provider.updateBot(externalBotId, {
        botName,
        joinAt: movedTo,
        meetingUrl,
      });

      expect(updated.externalBotId).not.toBe(externalBotId);
      expect(emulator.getBot(externalBotId)).toBeUndefined();
      expect(emulator.getBot(updated.externalBotId)?.join_at).toBe(
        movedTo.toISOString(),
      );
      expect(emulator.getBot(updated.externalBotId)?.bot_name).toBe(botName);
    });

    test("updates the meeting URL for a scheduled bot", async () => {
      const { externalBotId } = await provider.scheduleBot({
        meetingUrl: "https://acme.zoom.us/j/8123456789?pwd=old",
        joinAt: new Date("2026-05-04T09:00:00.000Z"),
      });

      const meetingUrl = "https://acme.zoom.us/j/8123456789?pwd=new";
      await provider.updateBot(externalBotId, {
        botName: MEETING_BOT_DISPLAY_NAME,
        meetingUrl,
      });

      expect(emulator.getBot(externalBotId)?.meeting_url).toBe(meetingUrl);
    });

    test("cancels a scheduled bot", async () => {
      const { externalBotId } = await provider.scheduleBot({
        meetingUrl: "https://meet.google.com/abc-defg-hij",
        joinAt: new Date("2026-05-04T09:00:00.000Z"),
      });

      await provider.cancelBot(externalBotId);

      expect(emulator.getBot(externalBotId)).toBeUndefined();
    });

    test("treats cancelling an unknown bot as a no-op and removes a joined bot", async () => {
      await expect(provider.cancelBot("bot_missing")).resolves.toBeUndefined();

      const { externalBotId } = await provider.scheduleBot({
        meetingUrl: "https://meet.google.com/abc-defg-hij",
        joinAt: new Date("2026-05-04T09:00:00.000Z"),
      });
      emulator.advance(externalBotId, "in_call_recording");

      await expect(provider.cancelBot(externalBotId)).resolves.toBeUndefined();
      expect(emulator.getBot(externalBotId)).toBeUndefined();
    });

    test("does not treat an unstarted leave response as a successful cancellation", async () => {
      const { externalBotId } = await provider.scheduleBot({
        meetingUrl: "https://meet.google.com/abc-defg-hij",
        joinAt: new Date("2026-05-04T09:00:00.000Z"),
      });
      emulator.advance(externalBotId, "in_call_recording");
      emulator.rejectNextLeaveCallAsUnstarted();

      await expect(provider.cancelBot(externalBotId)).rejects.toThrow(
        "cannot_command_unstarted_bot",
      );
      expect(emulator.getBot(externalBotId)).toBeDefined();
    });

    test("fetches a fresh download URL and normalizes the transcript", async () => {
      const { externalBotId } = await provider.scheduleBot({
        meetingUrl: "https://meet.google.com/abc-defg-hij",
        joinAt: new Date("2026-05-04T09:00:00.000Z"),
      });
      const transcriptId = emulator.attachTranscript(externalBotId, TURNS);
      await provider.createTranscript(
        emulator.getBot(externalBotId)?.recording_id ?? "",
      );

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
