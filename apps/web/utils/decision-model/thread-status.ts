import type { ConversationStatus } from "@/utils/reply-tracker/conversation-status-config";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { Logger } from "@/utils/logger";
import type { EmailForLLM } from "@/utils/types";
import { getDecisionEmailState } from "./email-state";
import { type DecisionModelConfig, runDecisionModel } from "./decision-model";

const STATUS_QUESTION_KEY = "thread_status";
const MAX_MESSAGE_CONTENT_LENGTH = 4000;
const MIN_STATUS_CONFIDENCE = 0.6;

export async function decideThreadStatus({
  config,
  emailAccount,
  definitions,
  threadMessages,
  userSentLastEmail,
  logger,
}: {
  config: DecisionModelConfig;
  emailAccount: EmailAccountWithAI;
  definitions: { systemType: ConversationStatus; instructions: string }[];
  threadMessages: EmailForLLM[];
  userSentLastEmail: boolean;
  logger: Logger;
}): Promise<{ status: ConversationStatus; rationale: string }> {
  const statuses = definitions.map((definition) => definition.systemType);
  const response = await runDecisionModel({
    config,
    emailAccount,
    state: {
      accountOwner: {
        email: emailAccount.email,
        about: emailAccount.about || null,
      },
      userSentLastEmail,
      threadMessages: threadMessages.map((message) =>
        getDecisionEmailState(message, MAX_MESSAGE_CONTENT_LENGTH),
      ),
    },
    questions: {
      [STATUS_QUESTION_KEY]: {
        type: "choice",
        instructions: {
          question:
            "Which status applies to `threadMessages` from the perspective of `accountOwner`?",
          chronology:
            "Read every message from oldest to newest. Unanswered questions and promised future deliverables remain pending until fulfilled.",
          perspective:
            "Distinguish work owed by the account owner from work owed by another participant. Ignore exchanges solely between other participants.",
          latestMessage:
            "A newer informational message does not erase an older unresolved request or commitment.",
        },
        criteria: Object.fromEntries(
          definitions.map((definition) => [
            definition.systemType,
            definition.instructions,
          ]),
        ),
      },
    },
    label: "Determine thread status",
    logger,
  });

  const answer = response.answers[STATUS_QUESTION_KEY];
  if (answer?.type !== "choice") {
    throw new Error("Decision model response is missing the thread status");
  }
  if (!statuses.includes(answer.choice as ConversationStatus)) {
    throw new Error("Decision model returned an unknown thread status");
  }
  if (answer.confidence < MIN_STATUS_CONFIDENCE) {
    throw new Error("Decision model confidence is too low for thread status");
  }

  return {
    status: answer.choice as ConversationStatus,
    rationale: `Decision model chose ${answer.choice} with ${Math.round(answer.confidence * 100)}% confidence.`,
  };
}
