import type { Logger } from "@/utils/logger";
import type { MeetingBotProvider } from "@/utils/meeting-recorder/bot-provider";
import {
  isRecallConfigured,
  RECALL_BOT_PROVIDER,
  RecallBotProvider,
} from "@/utils/recall/client";

export const DEFAULT_MEETING_BOT_PROVIDER = RECALL_BOT_PROVIDER;

export function isMeetingBotProviderConfigured(): boolean {
  return isRecallConfigured();
}

export function createMeetingBotProvider(
  providerName: string,
  logger: Logger,
): MeetingBotProvider {
  if (providerName === RECALL_BOT_PROVIDER) {
    return new RecallBotProvider(logger);
  }
  throw new Error(`Unknown meeting bot provider: ${providerName}`);
}
