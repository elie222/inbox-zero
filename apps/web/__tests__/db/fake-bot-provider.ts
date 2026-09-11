import {
  MeetingBotProviderError,
  type MeetingBotProvider,
  type NormalizedTranscript,
} from "@/utils/meeting-recorder/bot-provider";

/**
 * In-memory stand-in for a bot provider. The reconciler only cares that a
 * provider hands back ids and accepts cancels, so this keeps the DB tests about
 * the state machine rather than about HTTP.
 */
export class FakeBotProvider implements MeetingBotProvider {
  readonly scheduled: Array<{
    botId: string;
    botName?: string;
    meetingUrl: string;
    joinAt: Date;
  }> = [];
  readonly updated: Array<{
    botId: string;
    botName: string;
    joinAt?: Date;
    meetingUrl?: string;
  }> = [];
  readonly cancelled: string[] = [];
  readonly deletedMedia: string[] = [];
  readonly transcriptsRequested: string[] = [];

  /** Set to make the next scheduleBot fail. */
  failNextSchedule: { permanent: boolean } | null = null;
  failNextCancel = false;
  beforeNextUpdate: (() => Promise<void>) | null = null;
  replacementBotIdOnNextUpdate: string | null = null;

  private nextId = 1;
  private transcript: NormalizedTranscript = [];

  async scheduleBot({
    botName,
    meetingUrl,
    joinAt,
  }: {
    botName?: string;
    meetingUrl: string;
    joinAt: Date;
  }): Promise<{ externalBotId: string }> {
    const failure = this.failNextSchedule;
    if (failure) {
      this.failNextSchedule = null;
      throw new MeetingBotProviderError(
        "scheduleBot failed",
        failure.permanent,
      );
    }

    const externalBotId = `fake_bot_${this.nextId++}`;
    this.scheduled.push({ botId: externalBotId, botName, meetingUrl, joinAt });
    return { externalBotId };
  }

  async updateBot(
    externalBotId: string,
    params: { botName: string; joinAt?: Date; meetingUrl?: string },
  ): Promise<{ externalBotId: string }> {
    this.updated.push({ botId: externalBotId, ...params });
    const beforeNextUpdate = this.beforeNextUpdate;
    this.beforeNextUpdate = null;
    const updatedExternalBotId =
      this.replacementBotIdOnNextUpdate ?? externalBotId;
    this.replacementBotIdOnNextUpdate = null;
    await beforeNextUpdate?.();
    return { externalBotId: updatedExternalBotId };
  }

  async cancelBot(externalBotId: string): Promise<void> {
    if (this.failNextCancel) {
      this.failNextCancel = false;
      throw new MeetingBotProviderError("cancelBot failed", false);
    }
    this.cancelled.push(externalBotId);
  }

  async createTranscript(externalRecordingId: string): Promise<void> {
    this.transcriptsRequested.push(externalRecordingId);
  }

  async fetchTranscript(): Promise<NormalizedTranscript> {
    return this.transcript;
  }

  async deleteMedia(externalBotId: string): Promise<void> {
    this.deletedMedia.push(externalBotId);
  }

  setTranscript(transcript: NormalizedTranscript) {
    this.transcript = transcript;
  }

  reset() {
    this.scheduled.length = 0;
    this.updated.length = 0;
    this.cancelled.length = 0;
    this.deletedMedia.length = 0;
    this.transcriptsRequested.length = 0;
    this.failNextSchedule = null;
    this.failNextCancel = false;
    this.beforeNextUpdate = null;
    this.replacementBotIdOnNextUpdate = null;
    this.nextId = 1;
  }
}
