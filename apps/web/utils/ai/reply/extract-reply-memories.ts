import { z } from "zod";
import {
  ReplyMemoryKind,
  ReplyMemoryScopeType,
} from "@/generated/prisma/enums";
import type { ReplyMemory } from "@/generated/prisma/client";
import { getUserInfoPrompt } from "@/utils/ai/helpers";
import { PROMPT_SECURITY_INSTRUCTIONS } from "@/utils/ai/security";
import { extractDomainFromEmail } from "@/utils/email";
import { createGenerateObject } from "@/utils/llms";
import { getModel } from "@/utils/llms/model";
import { withNetworkRetry } from "@/utils/llms/retry";
import type { getEmailAccountWithAi } from "@/utils/user/get";

const MAX_MEMORIES_PER_EDIT = 3;

const replyMemorySchema = z.object({
  memories: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(120),
        content: z.string().trim().min(1).max(400),
        kind: z.nativeEnum(ReplyMemoryKind),
        scopeType: z.nativeEnum(ReplyMemoryScopeType),
        scopeValue: z.string().trim().max(200),
      }),
    )
    .max(MAX_MEMORIES_PER_EDIT),
});

function getSystemPrompt() {
  return `You analyze how a user edits AI-generated email reply drafts and turn durable patterns into reusable drafting memories.

${PROMPT_SECURITY_INSTRUCTIONS}

Return only memories that are likely to help with future drafts.

Memory kinds:
- FACT: reusable factual corrections, business rules, or handling guidance
- STYLE: tone, length, formatting, and phrasing habits

Scopes:
- GLOBAL: applies broadly to the user's replies
- SENDER: applies to one sender email address
- DOMAIN: applies to one sender domain
- TOPIC: applies to a reusable topic or subject area

Rules:
- Return at most ${MAX_MEMORIES_PER_EDIT} memories.
- Skip one-off contextual details that should not be reused later.
- If the edit only changes a meeting time, date, greeting, sign-off, or other thread-specific logistics, return no memory unless the user stated a stable rule.
- Prefer concise, direct drafting instructions.
- Do not infer a durable style preference from a single scheduling choice or one-off availability update.
- Use FACT when the edit adds reusable business information, policy, pricing, product capabilities, constraints, or recurring handling guidance.
- Use STYLE for stable tone, length, formatting, or phrasing preferences.
- For GLOBAL scope, leave scopeValue empty.
- For SENDER scope, use the exact sender email from the context.
- For DOMAIN scope, use the exact sender domain from the context.
- For TOPIC scope, use a short stable topic phrase such as "pricing" or "refunds".
- Always include a scopeValue field. Use an empty string for GLOBAL scope.
- Avoid duplicating an existing memory if the same idea is already covered.
- If nothing durable was learned, return an empty array.`;
}

export async function aiExtractReplyMemoriesFromDraftEdit({
  incomingEmailContent,
  draftText,
  sentText,
  senderEmail,
  existingMemories,
  learnedWritingStyle = null,
  emailAccount,
}: {
  incomingEmailContent: string;
  draftText: string;
  sentText: string;
  senderEmail: string;
  existingMemories: Pick<
    ReplyMemory,
    "title" | "content" | "kind" | "scopeType" | "scopeValue"
  >[];
  learnedWritingStyle?: string | null;
  emailAccount: NonNullable<Awaited<ReturnType<typeof getEmailAccountWithAi>>>;
}) {
  const normalizedIncomingEmailContent = incomingEmailContent.trim();
  const normalizedDraftText = draftText.trim();
  const normalizedSentText = sentText.trim();
  const normalizedSenderEmail = senderEmail.trim().toLowerCase();

  if (!normalizedSenderEmail) return [];
  if (!normalizedDraftText || !normalizedSentText) return [];
  if (
    normalizeMemoryText(normalizedDraftText) ===
    normalizeMemoryText(normalizedSentText)
  ) {
    return [];
  }

  const senderDomain = extractDomainFromEmail(
    normalizedSenderEmail,
  ).toLowerCase();
  const prompt = getPrompt({
    senderEmail: normalizedSenderEmail,
    senderDomain,
    incomingEmailContent: normalizedIncomingEmailContent,
    draftText: normalizedDraftText,
    sentText: normalizedSentText,
    existingMemories,
    learnedWritingStyle,
    emailAccount,
  });

  const modelOptions = getModel(emailAccount.user, "economy");
  const generateObject = createGenerateObject({
    emailAccount,
    label: "Reply memory extraction",
    modelOptions,
  });

  const result = await withNetworkRetry(
    () =>
      generateObject({
        ...modelOptions,
        system: getSystemPrompt(),
        prompt,
        schema: replyMemorySchema,
      }),
    { label: "Reply memory extraction" },
  );

  return result.object.memories
    .map((memory) => ({
      ...memory,
      title: memory.title.trim(),
      content: memory.content.trim(),
      scopeValue:
        memory.scopeType === ReplyMemoryScopeType.GLOBAL
          ? ""
          : memory.scopeValue.trim(),
    }))
    .slice(0, MAX_MEMORIES_PER_EDIT);
}

function getPrompt({
  senderEmail,
  senderDomain,
  incomingEmailContent,
  draftText,
  sentText,
  existingMemories,
  learnedWritingStyle,
  emailAccount,
}: {
  senderEmail: string;
  senderDomain: string;
  incomingEmailContent: string;
  draftText: string;
  sentText: string;
  existingMemories: Pick<
    ReplyMemory,
    "title" | "content" | "kind" | "scopeType" | "scopeValue"
  >[];
  learnedWritingStyle: string | null;
  emailAccount: NonNullable<Awaited<ReturnType<typeof getEmailAccountWithAi>>>;
}) {
  const learnedWritingStylePrompt = learnedWritingStyle
    ? `<learned_writing_style>
${learnedWritingStyle}
</learned_writing_style>
`
    : "";

  return `<source_email_sender>${senderEmail}</source_email_sender>
<source_email_domain>${senderDomain || "unknown"}</source_email_domain>

<incoming_email>
${incomingEmailContent}
</incoming_email>

<ai_draft>
${draftText}
</ai_draft>

<user_sent>
${sentText}
</user_sent>

<existing_memories>
${formatExistingMemories(existingMemories)}
</existing_memories>

${learnedWritingStylePrompt}

${getUserInfoPrompt({ emailAccount })}

Extract reusable reply memories from this draft edit.`;
}

function formatExistingMemories(
  memories: Pick<
    ReplyMemory,
    "title" | "content" | "kind" | "scopeType" | "scopeValue"
  >[],
) {
  if (!memories.length) return "None";

  return memories
    .map(
      (memory, index) =>
        `${index + 1}. [${memory.kind} | ${memory.scopeType}${
          memory.scopeValue ? `:${memory.scopeValue}` : ""
        }] ${memory.title}: ${memory.content}`,
    )
    .join("\n");
}

function normalizeMemoryText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
