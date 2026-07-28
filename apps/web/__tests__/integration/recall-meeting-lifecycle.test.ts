import type { NextRequest } from "next/server";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { MeetingRecordingStatus } from "@/generated/prisma/enums";
import { createTestLogger } from "@/__tests__/helpers";
import {
  createRecallEmulator,
  recallWebhookPayloads,
  type RecallEmulator,
} from "@/__tests__/emulators/recall";

vi.mock("server-only", () => ({}));

const envMock = vi.hoisted(() => ({
  RECALL_API_KEY: "emulator-recall-key",
  RECALL_BASE_URL: "",
  RECALL_WEBHOOK_SECRET: "",
}));

const prismaMock = vi.hoisted(() => ({
  meetingRecording: {
    updateMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));

const enqueueBackgroundJobMock = vi.hoisted(() => vi.fn());

vi.mock("@/env", () => ({ env: envMock }));
vi.mock("@/utils/prisma", () => ({ default: prismaMock }));
vi.mock("@/utils/queue/dispatch", () => ({
  enqueueBackgroundJob: (...args: unknown[]) =>
    enqueueBackgroundJobMock(...args),
}));
vi.mock("@/utils/middleware", async () => {
  const { createWithErrorTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithErrorTestMiddleware();
});

const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS;

/**
 * Drives a whole meeting the way Recall would: schedule a bot, deliver the
 * status webhooks the call produces, then pull the finished transcript back
 * through the provider. Everything except the database is real.
 */
describe.skipIf(!RUN_INTEGRATION_TESTS)(
  "Recall meeting lifecycle",
  { timeout: 30_000 },
  () => {
    let emulator: RecallEmulator;
    let provider: import("@/utils/recall/client").RecallBotProvider;
    let webhookRoute: typeof import("@/app/api/recall/webhook/route");

    beforeAll(async () => {
      emulator = await createRecallEmulator();
      envMock.RECALL_BASE_URL = emulator.apiBase;
      envMock.RECALL_API_KEY = emulator.apiKey;
      envMock.RECALL_WEBHOOK_SECRET = emulator.webhookSecret;

      const { RecallBotProvider } = await import("@/utils/recall/client");
      provider = new RecallBotProvider(createTestLogger());
      webhookRoute = await import("@/app/api/recall/webhook/route");
    });

    beforeEach(() => {
      emulator.reset();
      vi.clearAllMocks();
      prismaMock.meetingRecording.updateMany.mockResolvedValue({ count: 1 });
    });

    afterAll(() => emulator?.close());

    async function deliver(payload: unknown) {
      return webhookRoute.POST(
        emulator.signWebhook(payload) as unknown as NextRequest,
        { params: Promise.resolve({}) },
      );
    }

    test("carries a call from scheduled through to a stored transcript", async () => {
      const { externalBotId } = await provider.scheduleBot({
        meetingUrl: "https://meet.google.com/abc-defg-hij",
        joinAt: new Date("2026-05-04T09:00:00.000Z"),
      });

      // The status sequence a real call produces.
      for (const code of [
        "joining_call",
        "in_waiting_room",
        "in_call_not_recording",
        "in_call_recording",
        "call_ended",
        "done",
      ]) {
        emulator.advance(externalBotId, code);
        const response = await deliver(
          recallWebhookPayloads.statusChange(externalBotId, code),
        );
        expect(response.status).toBe(200);
      }

      const written = prismaMock.meetingRecording.updateMany.mock.calls.map(
        (call) => (call[0] as { data: { status: string } }).data.status,
      );
      expect(written).toEqual([
        MeetingRecordingStatus.JOINING,
        MeetingRecordingStatus.IN_WAITING_ROOM,
        MeetingRecordingStatus.IN_CALL,
        MeetingRecordingStatus.RECORDING,
        MeetingRecordingStatus.CALL_ENDED,
        MeetingRecordingStatus.DONE,
      ]);

      // The transcript arrives on its own event, after the call is over.
      const transcriptId = emulator.attachTranscript(externalBotId, [
        {
          participant: {
            id: 1,
            name: "Alice",
            is_host: true,
            email: "alice@example.com",
          },
          words: [
            {
              text: "Ship",
              start_timestamp: { relative: 0 },
              end_timestamp: { relative: 0.5 },
            },
            {
              text: "it",
              start_timestamp: { relative: 0.5 },
              end_timestamp: { relative: 0.8 },
            },
          ],
        },
      ]);

      prismaMock.meetingRecording.findUnique.mockResolvedValue({
        id: "recording-1",
        transcriptFetchedAt: null,
      });

      await deliver(
        recallWebhookPayloads.transcriptDone(externalBotId, transcriptId),
      );

      expect(prismaMock.meetingRecording.update).toHaveBeenCalledWith({
        where: { id: "recording-1" },
        data: { externalTranscriptId: transcriptId },
      });
      expect(enqueueBackgroundJobMock).toHaveBeenCalledWith(
        expect.objectContaining({ body: { recordingId: "recording-1" } }),
      );

      // What the queue job would then fetch.
      await expect(provider.fetchTranscript(transcriptId)).resolves.toEqual([
        {
          speakerName: "Alice",
          isHost: true,
          email: "alice@example.com",
          startTime: 0,
          endTime: 0.8,
          text: "Ship it",
        },
      ]);
    });

    test("keeps the recording on its furthest status when events arrive out of order", async () => {
      const { externalBotId } = await provider.scheduleBot({
        meetingUrl: "https://meet.google.com/abc-defg-hij",
        joinAt: new Date("2026-05-04T09:00:00.000Z"),
      });

      await deliver(
        recallWebhookPayloads.statusChange(externalBotId, "in_call_recording"),
      );
      // A delayed duplicate of an earlier event.
      await deliver(
        recallWebhookPayloads.statusChange(externalBotId, "joining_call"),
      );

      const guards = prismaMock.meetingRecording.updateMany.mock.calls.map(
        (call) => (call[0] as { where: { status: { in: string[] } } }).where,
      );

      // The late JOINING write can only land on a recording still behind it,
      // so a recording already RECORDING is untouched.
      expect(guards[1]?.status.in).not.toContain(
        MeetingRecordingStatus.RECORDING,
      );
    });

    test("records the host declining as a readable failure", async () => {
      const { externalBotId } = await provider.scheduleBot({
        meetingUrl: "https://meet.google.com/abc-defg-hij",
        joinAt: new Date("2026-05-04T09:00:00.000Z"),
      });

      await deliver(
        recallWebhookPayloads.statusChange(
          externalBotId,
          "fatal",
          "recording_permission_denied",
        ),
      );

      const { data } = prismaMock.meetingRecording.updateMany.mock
        .calls[0]?.[0] as {
        data: { status: string; failureReason: string };
      };
      expect(data.status).toBe(MeetingRecordingStatus.FAILED);
      expect(data.failureReason).toMatch(/declined/i);
    });

    test("rejects a webhook signed with the wrong secret", async () => {
      const response = await webhookRoute.POST(
        emulator.signWebhook(
          recallWebhookPayloads.statusChange("bot_1", "in_call_recording"),
          { secret: `whsec_${Buffer.from("attacker").toString("base64")}` },
        ) as unknown as NextRequest,
        { params: Promise.resolve({}) },
      );

      expect(response.status).toBe(401);
      expect(prismaMock.meetingRecording.updateMany).not.toHaveBeenCalled();
    });
  },
);
