import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  captureExceptionMock,
  createTranscriptMock,
  enqueueBackgroundJobMock,
  envMock,
  mockPrisma,
} = vi.hoisted(() => ({
  captureExceptionMock: vi.fn(),
  createTranscriptMock: vi.fn(),
  enqueueBackgroundJobMock: vi.fn(),
  envMock: { RECALL_WEBHOOK_SECRET: "" },
  mockPrisma: {
    meetingRecording: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("@/env", () => ({ env: envMock }));

vi.mock("@/utils/error", () => ({
  captureException: (...args: unknown[]) => captureExceptionMock(...args),
}));

vi.mock("@/utils/prisma", () => ({ default: mockPrisma }));

vi.mock("@/utils/queue/dispatch", () => ({
  enqueueBackgroundJob: (...args: unknown[]) =>
    enqueueBackgroundJobMock(...args),
}));

vi.mock("@/utils/meeting-recorder/create-bot-provider", () => ({
  DEFAULT_MEETING_BOT_PROVIDER: "recall",
  createMeetingBotProvider: () => ({
    createTranscript: (...args: unknown[]) => createTranscriptMock(...args),
  }),
}));

vi.mock("@/utils/middleware", async () => {
  const { createWithErrorTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithErrorTestMiddleware();
});

import type { NextRequest } from "next/server";
import { MeetingRecordingStatus } from "@/generated/prisma/enums";
import { POST } from "./route";

const SECRET = `whsec_${Buffer.from("recall-webhook-secret").toString("base64")}`;
const NOW = new Date("2026-05-04T09:00:00.000Z");

describe("Recall webhook route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    envMock.RECALL_WEBHOOK_SECRET = SECRET;
    mockPrisma.meetingRecording.updateMany.mockResolvedValue({ count: 1 });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("rejects a payload that is not signed with the configured secret", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const body = JSON.stringify({
      event: "bot.in_call_recording",
      data: { bot: { id: "bot-1" }, data: { code: "in_call_recording" } },
    });

    const response = await post(body, {
      secret: `whsec_${Buffer.from("wrong").toString("base64")}`,
    });

    expect(response.status).toBe(401);
    expect(mockPrisma.meetingRecording.updateMany).not.toHaveBeenCalled();
    const warning = warnSpy.mock.calls.flat().join(" ");
    expect(warning).toContain(
      '"verificationFailureReason": "signature_mismatch"',
    );
    expect(warning).toMatch(
      /"webhookSecretFingerprint": "sha256:[a-f0-9]{12}"/,
    );
    expect(warning).not.toContain(SECRET);
  });

  it("moves a recording forwards only from an earlier status", async () => {
    const body = JSON.stringify({
      event: "bot.in_call_recording",
      data: { bot: { id: "bot-1" }, data: { code: "in_call_recording" } },
    });

    const response = await post(body);

    expect(response.status).toBe(200);
    const where = mockPrisma.meetingRecording.updateMany.mock.calls[0]?.[0]
      ?.where as { status: { in: string[] } };
    expect(where.status.in).toContain(MeetingRecordingStatus.JOINING);
    expect(where.status.in).not.toContain(MeetingRecordingStatus.DONE);
  });

  it("records a human readable reason when the host declines recording", async () => {
    const body = JSON.stringify({
      event: "bot.fatal",
      data: {
        bot: { id: "bot-1" },
        data: { code: "fatal", sub_code: "recording_permission_denied" },
      },
    });

    await post(body);

    const data = mockPrisma.meetingRecording.updateMany.mock.calls[0]?.[0]
      ?.data as { status: string; failureReason: string };
    expect(data.status).toBe(MeetingRecordingStatus.FAILED);
    expect(data.failureReason).toMatch(/declined/i);
  });

  it("keeps recoverable media live when a fatal event follows recording", async () => {
    const body = JSON.stringify({
      event: "bot.fatal",
      data: {
        bot: { id: "bot-1" },
        data: { code: "fatal", sub_code: "teams_transient_error" },
      },
    });

    await post(body);

    const where = mockPrisma.meetingRecording.updateMany.mock.calls[0]?.[0]
      ?.where as { status: { in: string[] } };
    expect(where.status.in).not.toContain(MeetingRecordingStatus.RECORDING);
    expect(where.status.in).not.toContain(MeetingRecordingStatus.CALL_ENDED);
  });

  it("leaves the recording live when transcription fails so the sweep can retry", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const body = JSON.stringify({
      event: "transcript.failed",
      data: {
        bot: { id: "bot-1" },
        transcript: { id: "transcript-1" },
        data: { code: "failed" },
      },
    });

    const response = await post(body);

    expect(response.status).toBe(200);
    expect(mockPrisma.meetingRecording.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.meetingRecording.update).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('"externalBotId": "bot-1"'),
    );
  });

  it("marks the recording failed when the recording itself fails", async () => {
    const body = JSON.stringify({
      event: "recording.failed",
      data: { bot: { id: "bot-1" }, data: { code: "failed" } },
    });

    await post(body);

    const data = mockPrisma.meetingRecording.updateMany.mock.calls[0]?.[0]
      ?.data as { status: string };
    expect(data.status).toBe(MeetingRecordingStatus.FAILED);
  });

  it("queues transcript processing once a transcript is ready", async () => {
    mockPrisma.meetingRecording.findUnique.mockResolvedValue({
      id: "recording-1",
      transcriptFetchedAt: null,
    });

    const body = JSON.stringify({
      event: "transcript.done",
      data: { bot: { id: "bot-1" }, transcript: { id: "transcript-1" } },
    });

    await post(body);

    expect(mockPrisma.meetingRecording.update).toHaveBeenCalledWith({
      where: { id: "recording-1" },
      data: { externalTranscriptId: "transcript-1" },
    });
    expect(enqueueBackgroundJobMock).toHaveBeenCalledWith(
      expect.objectContaining({ body: { recordingId: "recording-1" } }),
    );
  });

  it("does not requeue a transcript that was already stored", async () => {
    mockPrisma.meetingRecording.findUnique.mockResolvedValue({
      id: "recording-1",
      transcriptFetchedAt: NOW,
    });

    const body = JSON.stringify({
      event: "transcript.done",
      data: { bot: { id: "bot-1" }, transcript: { id: "transcript-1" } },
    });

    await post(body);

    expect(enqueueBackgroundJobMock).not.toHaveBeenCalled();
  });

  it("acknowledges a webhook for a bot it does not know", async () => {
    mockPrisma.meetingRecording.findUnique.mockResolvedValue(null);

    const body = JSON.stringify({
      event: "transcript.done",
      data: { bot: { id: "unknown-bot" }, transcript: { id: "transcript-1" } },
    });

    const response = await post(body);

    expect(response.status).toBe(200);
    expect(captureExceptionMock).toHaveBeenCalled();
    expect(enqueueBackgroundJobMock).not.toHaveBeenCalled();
  });

  it("does not transcribe a recording after it was cancelled", async () => {
    mockPrisma.meetingRecording.findUnique.mockResolvedValue({
      id: "recording-1",
      status: MeetingRecordingStatus.CANCELLED,
    });

    const body = JSON.stringify({
      event: "recording.done",
      data: { bot: { id: "bot-1" }, recording: { id: "recording-1" } },
    });

    const response = await post(body);

    expect(response.status).toBe(200);
    expect(createTranscriptMock).not.toHaveBeenCalled();
  });
});

function post(body: string, { secret = SECRET }: { secret?: string } = {}) {
  // The route only reads standard Request members, so a plain Request is enough.
  return POST(signedRequest(body, secret) as NextRequest, {
    params: Promise.resolve({}),
  });
}

function signedRequest(body: string, secret: string) {
  const id = "msg_1";
  const timestamp = Math.floor(NOW.getTime() / 1000);
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signature = crypto
    .createHmac("sha256", key)
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");

  return new Request("http://localhost:3000/api/recall/webhook", {
    method: "POST",
    body,
    headers: {
      "svix-id": id,
      "svix-timestamp": String(timestamp),
      "svix-signature": `v1,${signature}`,
    },
  });
}
