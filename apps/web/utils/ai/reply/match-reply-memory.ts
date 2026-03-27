import { z } from "zod";
import type { ReplyMemory } from "@/generated/prisma/client";
import { PROMPT_SECURITY_INSTRUCTIONS } from "@/utils/ai/security";
import { createGenerateObject } from "@/utils/llms";
import { getModel } from "@/utils/llms/model";
import type { getEmailAccountWithAi } from "@/utils/user/get";

const replyMemoryMatchSchema = z.object({
  matchingExistingMemoryId: z.string().trim().nullable(),
});

export async function aiFindMatchingReplyMemoryId({
  emailAccount,
  memory,
  normalizedScopeValue,
  candidates,
}: {
  emailAccount: NonNullable<Awaited<ReturnType<typeof getEmailAccountWithAi>>>;
  memory: Pick<ReplyMemory, "content" | "kind" | "scopeType">;
  normalizedScopeValue: string;
  candidates: Pick<ReplyMemory, "id" | "content">[];
}) {
  if (!candidates.length) return null;

  const modelOptions = getModel(emailAccount.user, "economy");
  const generateObject = createGenerateObject({
    emailAccount,
    label: "Reply memory merge matching",
    modelOptions,
  });

  const result = await generateObject({
    ...modelOptions,
    system: `You decide whether a newly extracted reply memory should attach to an existing reply memory instead of creating a new one.

${PROMPT_SECURITY_INSTRUCTIONS}

Work language-agnostically. The memories may be written in any language.

Match an existing memory when:
- it captures the same durable instruction, fact, or procedure
- differences are only phrasing, wording, examples, or minor emphasis
- the new memory would be redundant if stored separately

Return null when:
- the new memory adds a meaningfully different rule, fact, or workflow
- two memories are related but should still remain separate
- no candidate is a strong semantic match

Rules:
- Only return an id from the provided candidate list.
- Be conservative: pick an id only when the match is clearly the same memory.
- Ignore exact wording; focus on semantic equivalence.
- Do not invent or rewrite memory text.`,
    prompt: `<new_memory>
kind: ${memory.kind}
scope_type: ${memory.scopeType}
scope_value: ${normalizedScopeValue || "(global)"}
content: ${memory.content}
</new_memory>

<existing_memories>
${candidates
  .map(
    (candidate, index) =>
      `${index + 1}. id=${candidate.id}\ncontent: ${candidate.content}`,
  )
  .join("\n\n")}
</existing_memories>

Choose the existing memory id if one existing memory already captures the same durable idea as the new memory. Otherwise return null.`,
    schema: replyMemoryMatchSchema,
  });

  const matchingId = result.object.matchingExistingMemoryId;
  if (!matchingId) return null;

  return candidates.some((candidate) => candidate.id === matchingId)
    ? matchingId
    : null;
}
