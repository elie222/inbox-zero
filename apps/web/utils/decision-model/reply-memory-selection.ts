import type { ReplyMemory } from "@/generated/prisma/client";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { Logger } from "@/utils/logger";
import {
  type DecisionModelConfig,
  type DecisionQuestion,
  runDecisionModel,
} from "./decision-model";

const MEMORY_KEY_PREFIX = "memory_";
const MIN_RELEVANCE_PROBABILITY = 0.5;
const MAX_SELECTED_REPLY_MEMORIES = 6;
const MAX_EMAIL_CONTENT_LENGTH = 4000;

type ReplyMemoryCandidate = Pick<
  ReplyMemory,
  "id" | "content" | "kind" | "scopeType" | "scopeValue"
>;

export async function decideRelevantReplyMemories({
  config,
  candidates,
  emailContent,
  emailAccount,
  logger,
}: {
  config: DecisionModelConfig;
  candidates: ReplyMemoryCandidate[];
  emailContent: string;
  emailAccount: EmailAccountWithAI;
  logger: Logger;
}): Promise<string[]> {
  const questions: Record<string, DecisionQuestion> = Object.fromEntries(
    candidates.map((_memory, index) => [
      `${MEMORY_KEY_PREFIX}${index}`,
      {
        type: "yesNo",
        instructions: `Would \`replyMemories[${index}]\` materially improve a reply to \`incomingEmail\`?`,
        criteria: {
          true: "The memory answers this email, its procedure is triggered by this email, or its guidance applies specifically to this sender or company.",
          false:
            "The memory is unrelated, only loosely related, or would not change the reply. Irrelevant memories degrade reply quality.",
        },
      },
    ]),
  );

  const response = await runDecisionModel({
    config,
    emailAccount,
    state: {
      accountOwner: {
        email: emailAccount.email,
        about: emailAccount.about || null,
      },
      incomingEmail: emailContent.slice(0, MAX_EMAIL_CONTENT_LENGTH),
      replyMemories: candidates.map((memory) => ({
        content: memory.content,
        kind: memory.kind,
        scopeType: memory.scopeType,
        scopeValue: memory.scopeValue,
      })),
    },
    questions,
    label: "Reply memory selection",
    logger,
  });

  return candidates
    .map((memory, index) => {
      const answer = response.answers[`${MEMORY_KEY_PREFIX}${index}`];
      return {
        id: memory.id,
        probability: answer?.type === "yesNo" ? answer.probability : 0,
      };
    })
    .filter(({ probability }) => probability >= MIN_RELEVANCE_PROBABILITY)
    .sort((a, b) => b.probability - a.probability)
    .slice(0, MAX_SELECTED_REPLY_MEMORIES)
    .map(({ id }) => id);
}
