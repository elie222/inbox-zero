import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { env } from "@/env";
import type { Logger } from "@/utils/logger";
import {
  MEETING_BOT_DISPLAY_NAME,
  MeetingBotProviderError,
  type MeetingBotProvider,
  type NormalizedTranscript,
} from "@/utils/meeting-recorder/bot-provider";
import { normalizeRecallTranscript } from "@/utils/recall/transcript";
import {
  recallBotSchema,
  recallTranscriptDownloadSchema,
  recallTranscriptSchema,
} from "@/utils/recall/types";

// The `botProvider` value Recall-backed recordings are stored under. Fixed
// forever: historical rows keep this value even if the default provider moves.
export const RECALL_BOT_PROVIDER = "recall";

/**
 * Whether Recall can be used end to end. The API key alone is not enough:
 * without the webhook secret we would book bots whose lifecycle events we can
 * never verify, so the two are only ever configured as a pair.
 */
export function isRecallConfigured(): boolean {
  return Boolean(env.RECALL_API_KEY && env.RECALL_WEBHOOK_SECRET);
}

const DEFAULT_RECALL_REGION = "us-west-2";

// Overridden only to point at the local emulator, same as GOOGLE_BASE_URL.
function getRecallApiBase(): string {
  if (env.RECALL_BASE_URL) {
    return env.RECALL_BASE_URL.replace(/\/+$/, "");
  }

  return `https://${env.RECALL_REGION ?? DEFAULT_RECALL_REGION}.recall.ai/api/v1`;
}

class RecallApiError extends MeetingBotProviderError {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string, path: string) {
    super(`Recall API ${status} for ${path}: ${body}`, isPermanent(status));
    this.name = "RecallApiError";
    this.status = status;
    this.body = body;
  }
}

export class RecallBotProvider implements MeetingBotProvider {
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async scheduleBot({
    botName = MEETING_BOT_DISPLAY_NAME,
    meetingUrl,
    joinAt,
  }: {
    botName?: string;
    meetingUrl: string;
    joinAt: Date;
  }): Promise<{ externalBotId: string }> {
    const cameraImage = await getMeetingBotCameraImage();

    // No transcript config here on purpose: `recallai_async` is not a
    // bot-creation provider. Async transcription is requested per recording,
    // after `recording.done`, via createTranscript below.
    // https://docs.recall.ai/docs/bot-async-transcription
    const response = await this.request("/bot/", {
      method: "POST",
      body: {
        meeting_url: meetingUrl,
        bot_name: botName,
        join_at: joinAt.toISOString(),
        automatic_video_output: {
          in_call_recording: {
            kind: "jpeg",
            b64_data: cameraImage,
          },
        },
      },
    });

    const bot = recallBotSchema.parse(response);
    return { externalBotId: bot.id };
  }

  async updateBot(
    externalBotId: string,
    {
      botName,
      joinAt,
      meetingUrl,
    }: { botName: string; joinAt?: Date; meetingUrl?: string },
  ): Promise<{ externalBotId: string }> {
    try {
      await this.request(`/bot/${externalBotId}/`, {
        method: "PATCH",
        body: {
          ...(botName && { bot_name: botName }),
          ...(joinAt && { join_at: joinAt.toISOString() }),
          ...(meetingUrl && { meeting_url: meetingUrl }),
        },
      });
      return { externalBotId };
    } catch (error) {
      if (
        !(
          joinAt &&
          meetingUrl &&
          (isRejectedReschedule(error) || isMissing(error))
        )
      ) {
        throw error;
      }

      await this.cancelBot(externalBotId);
      return this.scheduleBot({ botName, meetingUrl, joinAt });
    }
  }

  async cancelBot(externalBotId: string): Promise<void> {
    try {
      await this.request(`/bot/${externalBotId}/`, { method: "DELETE" });
    } catch (error) {
      if (isMissing(error)) {
        this.logger.info("Recall bot was already gone", {
          externalBotId,
        });
        return;
      }

      if (!isAlreadyJoining(error)) throw error;

      try {
        await this.request(`/bot/${externalBotId}/leave_call/`, {
          method: "POST",
        });
      } catch (leaveError) {
        if (!isAlreadyGoneFromCall(leaveError)) throw leaveError;
        this.logger.info("Recall bot had already left the call", {
          externalBotId,
        });
      }
    }
  }

  async createTranscript(externalRecordingId: string): Promise<void> {
    // Diarization sits at the top level here, not inside the provider object,
    // which is where it goes for the real-time provider at bot creation.
    await this.request(`/recording/${externalRecordingId}/create_transcript/`, {
      method: "POST",
      body: {
        provider: { recallai_async: { language_code: "auto" } },
        diarization: { use_separate_streams_when_available: true },
      },
    });
  }

  async fetchTranscript(
    externalTranscriptId: string,
  ): Promise<NormalizedTranscript> {
    // The download URL in the webhook is short-lived, so always ask Recall for
    // a fresh presigned URL rather than storing the one we were handed.
    const transcript = recallTranscriptSchema.parse(
      await this.request(`/transcript/${externalTranscriptId}/`, {
        method: "GET",
      }),
    );

    const downloadUrl = transcript.data?.download_url;
    if (!downloadUrl) {
      throw new Error(
        `Recall transcript ${externalTranscriptId} has no download URL`,
      );
    }

    const download = await fetch(downloadUrl);
    if (!download.ok) {
      throw new RecallApiError(
        download.status,
        await download.text(),
        "transcript download",
      );
    }

    return normalizeRecallTranscript(
      recallTranscriptDownloadSchema.parse(await download.json()),
    );
  }

  async deleteMedia(externalBotId: string): Promise<void> {
    try {
      await this.request(`/bot/${externalBotId}/delete_media/`, {
        method: "POST",
      });
    } catch (error) {
      if (error instanceof RecallApiError && error.status === 404) {
        this.logger.info("Recall media already deleted", { externalBotId });
        return;
      }
      throw error;
    }
  }

  private async request(
    path: string,
    { method, body }: { method: string; body?: unknown },
  ): Promise<unknown> {
    if (!env.RECALL_API_KEY) {
      throw new Error("RECALL_API_KEY is not configured");
    }

    const response = await fetch(`${getRecallApiBase()}${path}`, {
      method,
      headers: {
        Authorization: `Token ${env.RECALL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!response.ok) {
      throw new RecallApiError(response.status, await response.text(), path);
    }

    if (response.status === 204) return null;

    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
}

function isRejectedReschedule(error: unknown): boolean {
  return (
    error instanceof RecallApiError &&
    error.status === 400 &&
    getRecallErrorCode(error) === "update_bot_failed"
  );
}

function isMissing(error: unknown): boolean {
  return error instanceof RecallApiError && error.status === 404;
}

function isAlreadyJoining(error: unknown): boolean {
  if (!(error instanceof RecallApiError)) return false;
  if (error.status === 405) return true;

  return (
    error.status === 400 && getRecallErrorCode(error) === "cannot_delete_bot"
  );
}

function isAlreadyGoneFromCall(error: unknown): boolean {
  if (isMissing(error)) return true;
  if (!(error instanceof RecallApiError) || error.status !== 400) return false;

  const code = getRecallErrorCode(error);
  return code === "cannot_command_completed_bot";
}

function getRecallErrorCode(error: RecallApiError): string | null {
  try {
    const body = JSON.parse(error.body) as { code?: unknown };
    return typeof body.code === "string" ? body.code : null;
  } catch {
    return null;
  }
}

/**
 * Whether replaying the same request could ever succeed. Most 4xx responses
 * mean the request itself is wrong (bad meeting URL, unsupported platform), but
 * throttling and timeouts are 4xx and clear on their own, and treating those as
 * permanent would drop the claim and skip the meeting.
 */
function isPermanent(status: number): boolean {
  if (status === 408 || status === 425 || status === 429) return false;
  return status >= 400 && status < 500;
}

let meetingBotCameraImagePromise: Promise<string> | undefined;

function getMeetingBotCameraImage(): Promise<string> {
  meetingBotCameraImagePromise ??= readMeetingBotCameraImage().catch(
    (error) => {
      meetingBotCameraImagePromise = undefined;
      throw error;
    },
  );
  return meetingBotCameraImagePromise;
}

async function readMeetingBotCameraImage(): Promise<string> {
  const relativePath = join(
    "public",
    "images",
    "meetings",
    "inbox-zero-notetaker.jpg",
  );
  const candidatePaths = [
    join(process.cwd(), relativePath),
    join(process.cwd(), "apps", "web", relativePath),
  ];

  for (const path of candidatePaths) {
    try {
      return await readFile(path, "base64");
    } catch (error) {
      if (!isMissingFile(error)) throw error;
    }
  }

  throw new Error("Recall meeting bot camera image is missing");
}

function isMissingFile(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
