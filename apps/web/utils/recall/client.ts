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

const RECALL_API_BASE = "https://us-west-2.recall.ai/api/v1";

// Overridden only to point at the local emulator, same as GOOGLE_BASE_URL.
function getRecallApiBase(): string {
  return env.RECALL_BASE_URL?.replace(/\/+$/, "") || RECALL_API_BASE;
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
  readonly name = "recall";
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async scheduleBot({
    meetingUrl,
    joinAt,
  }: {
    meetingUrl: string;
    joinAt: Date;
  }): Promise<{ externalBotId: string }> {
    // No transcript config here on purpose: `recallai_async` is not a
    // bot-creation provider. Async transcription is requested per recording,
    // after `recording.done`, via createTranscript below.
    // https://docs.recall.ai/docs/bot-async-transcription
    const response = await this.request("/bot/", {
      method: "POST",
      body: {
        meeting_url: meetingUrl,
        bot_name: MEETING_BOT_DISPLAY_NAME,
        join_at: joinAt.toISOString(),
      },
    });

    const bot = recallBotSchema.parse(response);
    return { externalBotId: bot.id };
  }

  async updateBot(
    externalBotId: string,
    { joinAt, meetingUrl }: { joinAt?: Date; meetingUrl?: string },
  ): Promise<void> {
    await this.request(`/bot/${externalBotId}/`, {
      method: "PATCH",
      body: {
        ...(joinAt && { join_at: joinAt.toISOString() }),
        ...(meetingUrl && { meeting_url: meetingUrl }),
      },
    });
  }

  async cancelBot(externalBotId: string): Promise<void> {
    try {
      await this.request(`/bot/${externalBotId}/`, { method: "DELETE" });
    } catch (error) {
      // A bot that is gone or already in the call cannot be cancelled, and
      // neither case is worth failing a reconciler pass over.
      if (isTolerableCancelError(error)) {
        this.logger.info("Recall bot could not be cancelled", {
          externalBotId,
          error,
        });
        return;
      }
      throw error;
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

function isTolerableCancelError(error: unknown): boolean {
  if (!(error instanceof RecallApiError)) return false;
  // Recall answers 400 with an explanatory body when the bot has already joined.
  return error.status === 404 || error.status === 400;
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
