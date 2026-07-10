import { z } from "zod";
import type { ReplyMemory } from "@/generated/prisma/client";
import { getUserInfoPrompt } from "@/utils/ai/helpers";
import { createGenerateObject } from "@/utils/llms";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { getModelForUseCase, LlmUseCase } from "@/utils/llms/use-cases";
import type { Logger } from "@/utils/logger";
import { truncate } from "@/utils/string";
import { formatReplyMemoryPromptLine } from "./extract-reply-memories";

const MAX_SELECTED_REPLY_MEMORIES = 6;
const MAX_EMAIL_CONTENT_LENGTH = 4000;

type ReplyMemoryCandidate = Pick<
  ReplyMemory,
  "id" | "content" | "kind" | "scopeType" | "scopeValue"
>;

const system = `You select which stored reply memories are relevant for drafting a reply to a specific incoming email.

Memories are facts and instructions learned from how the user edited previous AI reply drafts. They will be injected into the drafting prompt. Injecting irrelevant memories degrades draft quality, so be selective.

Selection rules:
- Select a memory only when it would materially change or inform the reply to THIS email: a fact that answers something the email asks, a procedure whose trigger condition matches this situation, or guidance specific to this sender or their company.
- Conditional memories ("When X, ...") apply only when the email actually matches the condition.
- Prefer memories with concrete details (numbers, prices, contacts, links, policies) over generic advice.
- Fewer, highly relevant memories beat many loosely related ones.
- If no memory clearly applies, return an empty list.
- Work language-agnostically. The email and memories may be in different languages.

Return the ids of the selected memories, most relevant first, at most ${MAX_SELECTED_REPLY_MEMORIES}.`;

const selectionSchema = z.object({
  selectedMemoryIds: z
    .array(z.string().trim().min(1))
    .describe(
      "Ids of the candidate memories relevant to drafting a reply to this email, most relevant first. Empty when none apply.",
    ),
});

export async function selectReplyMemoriesForEmail<
  T extends ReplyMemoryCandidate,
>({
  prioritizedCandidates,
  emailContent,
  emailAccount,
  logger,
}: {
  prioritizedCandidates: T[];
  emailContent: string;
  emailAccount: EmailAccountWithAI;
  logger: Logger;
}): Promise<T[]> {
  if (prioritizedCandidates.length <= MAX_SELECTED_REPLY_MEMORIES) {
    return prioritizedCandidates;
  }

  const selectedIds = await aiSelectRelevantReplyMemories({
    candidates: prioritizedCandidates,
    emailContent,
    emailAccount,
    logger,
  });

  if (selectedIds === null) {
    return prioritizedCandidates.slice(0, MAX_SELECTED_REPLY_MEMORIES);
  }

  const candidatesById = new Map(
    prioritizedCandidates.map((memory) => [memory.id, memory]),
  );

  // Keep the model's most-relevant-first ordering rather than reverting to
  // prioritizedCandidates' scope-priority order.
  return selectedIds
    .map((id) => candidatesById.get(id))
    .filter((memory): memory is T => memory !== undefined);
}

export async function aiSelectRelevantReplyMemories({
  candidates,
  emailContent,
  emailAccount,
  logger,
}: {
  candidates: ReplyMemoryCandidate[];
  emailContent: string;
  emailAccount: EmailAccountWithAI;
  logger: Logger;
}): Promise<string[] | null> {
  try {
    const prompt = `<incoming_email>
${truncate(emailContent, MAX_EMAIL_CONTENT_LENGTH)}
</incoming_email>

<candidate_memories>
${candidates.map(formatReplyMemoryPromptLine).join("\n")}
</candidate_memories>

${getUserInfoPrompt({ emailAccount })}

Select the ids of the memories relevant to drafting a reply to this email.`;

    const modelOptions = getModelForUseCase(
      emailAccount.user,
      LlmUseCase.ReplyMemorySelection,
    );

    const generateObject = createGenerateObject({
      emailAccount,
      label: "Reply memory selection",
      modelOptions,
      promptHardening: { trust: "untrusted", level: "compact" },
    });

    const result = await generateObject({
      ...modelOptions,
      system,
      prompt,
      schema: selectionSchema,
    });

    const candidateIds = new Set(candidates.map((memory) => memory.id));

    return result.object.selectedMemoryIds
      .filter((id) => candidateIds.has(id))
      .slice(0, MAX_SELECTED_REPLY_MEMORIES);
  } catch (error) {
    logger.error("Failed to select relevant reply memories", { error });
    return null;
  }
}
