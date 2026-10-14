import type { EmailProvider } from "@/utils/email/types";
import type { Observation } from "./changes";

export async function getObservedMessage(
  provider: EmailProvider,
  observation: Observation,
) {
  try {
    return await provider.getMessage(observation.messageId);
  } catch (error) {
    if (!observation.rfcMessageId) throw error;
    const relocated = await provider.getMessageByRfc822MessageId(
      observation.rfcMessageId,
    );
    if (!relocated) throw error;
    // RFC lookup may return only metadata; filtering and training need the body.
    return provider.getMessage(relocated.id);
  }
}
