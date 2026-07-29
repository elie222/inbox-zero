// Product-facing name of the bot that appears in the participant list.
export const MEETING_BOT_DISPLAY_NAME = "Inbox Zero Notetaker";

interface TranscriptUtterance {
  email?: string;
  endTime: number;
  isHost: boolean;
  speakerName: string;
  /** Seconds from the start of the recording. */
  startTime: number;
  text: string;
}

/** Provider-neutral transcript. Everything downstream consumes only this. */
export type NormalizedTranscript = TranscriptUtterance[];

/**
 * A provider call that failed. `permanent` tells the reconciler whether
 * retrying the same request could ever succeed, so it can decide between
 * releasing its claim and leaving the row for the next pass.
 */
export class MeetingBotProviderError extends Error {
  readonly permanent: boolean;

  constructor(message: string, permanent: boolean) {
    super(message);
    this.name = "MeetingBotProviderError";
    this.permanent = permanent;
  }
}

export interface MeetingBotProvider {
  /** Tolerant: a bot that is already gone is not an error. */
  cancelBot(externalBotId: string): Promise<void>;
  /**
   * Asks the provider to start producing a transcript for a finished
   * recording. Providers that transcribe automatically may make this a no-op,
   * but the caller must always invoke it once the recording is ready.
   */
  createTranscript(externalRecordingId: string): Promise<void>;
  /** Tolerant: media that is already gone is not an error. */
  deleteMedia(externalBotId: string): Promise<void>;
  fetchTranscript(externalTranscriptId: string): Promise<NormalizedTranscript>;
  scheduleBot(params: {
    meetingUrl: string;
    joinAt: Date;
  }): Promise<{ externalBotId: string }>;
  /** Updates a bot that has been scheduled but has not started joining yet. */
  updateBot(
    externalBotId: string,
    params: { joinAt?: Date; meetingUrl?: string },
  ): Promise<{ externalBotId: string }>;
}
