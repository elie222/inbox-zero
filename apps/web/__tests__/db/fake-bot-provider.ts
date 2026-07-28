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
  readonly name = "recall";

  readonly scheduled: Array<{
    botId: string;
    meetingUrl: string;
    joinAt: Date;
  }> = [];
  readonly rescheduled: Array<{ botId: string; joinAt: Date }> = [];
  readonly cancelled: string[] = [];
  readonly deletedMedia: string[] = [];

  /** Set to make the next scheduleBot fail. */
  failNextSchedule: { permanent: boolean } | null = null;

  private nextId = 1;
  private transcript: NormalizedTranscript = [];

  async scheduleBot({
    meetingUrl,
    joinAt,
  }: {
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
    this.scheduled.push({ botId: externalBotId, meetingUrl, joinAt });
    return { externalBotId };
  }

  async rescheduleBot(
    externalBotId: string,
    { joinAt }: { joinAt: Date },
  ): Promise<void> {
    this.rescheduled.push({ botId: externalBotId, joinAt });
  }

  async cancelBot(externalBotId: string): Promise<void> {
    this.cancelled.push(externalBotId);
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
    this.rescheduled.length = 0;
    this.cancelled.length = 0;
    this.deletedMedia.length = 0;
    this.failNextSchedule = null;
    this.nextId = 1;
  }
}
