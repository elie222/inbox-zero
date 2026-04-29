import { z } from "zod";
import {
  ReplyMemoryKind,
  ReplyMemoryScopeType,
} from "@/generated/prisma/enums";
import type { ReplyMemory } from "@/generated/prisma/client";
import { getUserInfoPrompt } from "@/utils/ai/helpers";
import { extractDomainFromEmail, isPublicEmailDomain } from "@/utils/email";
import { createGenerateObject } from "@/utils/llms";
import { getModel } from "@/utils/llms/model";
import { isDefined } from "@/utils/types";
import type { getEmailAccountWithAi } from "@/utils/user/get";

const MAX_MEMORIES_PER_EDIT = 3;
const MAX_EXISTING_MEMORIES_IN_PROMPT = 16;

const newReplyMemorySchema = z.object({
  content: z.string().trim().min(1).max(400),
  kind: z.nativeEnum(ReplyMemoryKind),
  scopeType: z.nativeEnum(ReplyMemoryScopeType),
  scopeValue: z.string().trim().max(200),
});

const replyMemoryDecisionSchema = z.union([
  z.object({
    matchingExistingMemoryId: z.string().trim().min(1),
    newMemory: z.null(),
  }),
  z.object({
    matchingExistingMemoryId: z.null(),
    newMemory: newReplyMemorySchema,
  }),
]);

const replyMemorySchema = z.object({
  memories: z.array(replyMemoryDecisionSchema).max(MAX_MEMORIES_PER_EDIT),
});

export async function aiExtractReplyMemoriesFromDraftEdit({
  incomingEmailContent,
  draftText,
  sentText,
  senderEmail,
  existingMemories,
  writingStyle = null,
  learnedWritingStyle = null,
  emailAccount,
}: {
  incomingEmailContent: string;
  draftText: string;
  sentText: string;
  senderEmail: string;
  existingMemories: Pick<
    ReplyMemory,
    "id" | "content" | "kind" | "scopeType" | "scopeValue"
  >[];
  writingStyle?: string | null;
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

  const senderDomain = extractDomainFromEmail(normalizedSenderEmail);
  const allowDomainScope = !isPublicEmailDomain(senderDomain);
  const prompt = getPrompt({
    senderEmail: normalizedSenderEmail,
    senderDomain,
    incomingEmailContent: normalizedIncomingEmailContent,
    draftText: normalizedDraftText,
    sentText: normalizedSentText,
    existingMemories,
    writingStyle,
    learnedWritingStyle,
    emailAccount,
  });

  const modelOptions = getModel(emailAccount.user, "economy");
  const generateObject = createGenerateObject({
    emailAccount,
    label: "Reply memory extraction",
    modelOptions,
    promptHardening: { trust: "untrusted", level: "full" },
  });

  const result = await generateObject({
    ...modelOptions,
    system: getSystemPrompt({ allowDomainScope }),
    prompt,
    schema: replyMemorySchema,
  });

  return result.object.memories
    .map((decision) => {
      if (decision.matchingExistingMemoryId) {
        return {
          matchingExistingMemoryId: decision.matchingExistingMemoryId,
          newMemory: null,
        };
      }

      if (!decision.newMemory) return null;

      const newMemory = {
        content: decision.newMemory.content.trim(),
        kind: decision.newMemory.kind,
        scopeType:
          decision.newMemory.kind === ReplyMemoryKind.PREFERENCE
            ? ReplyMemoryScopeType.GLOBAL
            : decision.newMemory.scopeType,
        scopeValue:
          decision.newMemory.kind === ReplyMemoryKind.PREFERENCE ||
          decision.newMemory.scopeType === ReplyMemoryScopeType.GLOBAL
            ? ""
            : decision.newMemory.scopeValue.trim(),
      };

      if (
        newMemory.scopeType === ReplyMemoryScopeType.TOPIC &&
        !newMemory.scopeValue.length
      ) {
        return null;
      }

      if (
        newMemory.scopeType === ReplyMemoryScopeType.DOMAIN &&
        !allowDomainScope
      ) {
        return null;
      }

      return {
        matchingExistingMemoryId: null,
        newMemory,
      };
    })
    .filter(isDefined)
    .slice(0, MAX_MEMORIES_PER_EDIT);
}

function getPrompt({
  senderEmail,
  senderDomain,
  incomingEmailContent,
  draftText,
  sentText,
  existingMemories,
  writingStyle,
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
    "id" | "content" | "kind" | "scopeType" | "scopeValue"
  >[];
  writingStyle: string | null;
  learnedWritingStyle: string | null;
  emailAccount: NonNullable<Awaited<ReturnType<typeof getEmailAccountWithAi>>>;
}) {
  const trimmedWritingStyle = writingStyle?.trim();
  const trimmedLearnedWritingStyle = learnedWritingStyle?.trim();

  const writingStylePrompt = trimmedWritingStyle
    ? `<writing_style>
${trimmedWritingStyle}
</writing_style>
`
    : "";
  const learnedWritingStylePrompt = trimmedLearnedWritingStyle
    ? `<learned_writing_style>
${trimmedLearnedWritingStyle}
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

${writingStylePrompt}

${learnedWritingStylePrompt}

${getUserInfoPrompt({ emailAccount })}

Extract reusable reply memories from this draft edit.`;
}

function formatExistingMemories(
  memories: Pick<
    ReplyMemory,
    "id" | "content" | "kind" | "scopeType" | "scopeValue"
  >[],
) {
  if (!memories.length) return "None";

  return memories
    .slice(0, MAX_EXISTING_MEMORIES_IN_PROMPT)
    .map(
      (memory, index) =>
        `${index + 1}. id=${memory.id}\n[${memory.kind} | ${memory.scopeType}${
          memory.scopeValue ? `:${memory.scopeValue}` : ""
        }] ${memory.content}`,
    )
    .join("\n");
}

function normalizeMemoryText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function getSystemPrompt({ allowDomainScope }: { allowDomainScope: boolean }) {
  const domainScopeLine = allowDomainScope
    ? "- DOMAIN: applies to one sender domain\n"
    : "";
  const domainRuleLine = allowDomainScope
    ? "- For DOMAIN scope, use the exact sender domain from the context.\n"
    : "- DOMAIN scope is unavailable because the sender domain is a public email provider. Use SENDER for sender-specific rules, GLOBAL for broad account rules, or TOPIC for reusable topics.\n";

  return `You analyze how a user edits AI-generated email reply drafts and turn durable patterns into reusable drafting memories.

Return only memories that are likely to help with future drafts.

Memory kinds:
- FACT: reusable factual corrections, business rules, or durable knowledge
- PREFERENCE: tone, length, formatting, and phrasing habits
- PROCEDURE: repeatable ways to handle a recurring class of replies

Scopes:
- GLOBAL: applies broadly to the user's replies
- SENDER: applies to one sender email address
${domainScopeLine}- TOPIC: applies to a reusable topic or subject area

Rules:
- Return at most ${MAX_MEMORIES_PER_EDIT} memories.
- Skip one-off contextual details that should not be reused later.
- If the edit only changes a meeting time, date, greeting, sign-off, or other thread-specific logistics, return no memory unless the user stated a stable rule.
- Prefer concise, direct drafting instructions.
- Each memory should be a single prompt-ready instruction or fact in the content field. Do not split the same idea across a title and body.
- Do not infer a durable style preference from a single scheduling choice or one-off availability update.
- Do not store a PREFERENCE memory that simply repeats the user's explicit writing style setting.
- PREFERENCE memories are always account-level. Use GLOBAL scope for PREFERENCE memories.
- Use FACT when the edit adds reusable business information, policy, pricing, product capabilities, constraints, contacts, or logistics.
- Use PROCEDURE when the edit shows a reusable way to handle a recurring class of replies.
- Use PREFERENCE for stable tone, length, formatting, or phrasing preferences.
- For GLOBAL scope, leave scopeValue empty.
- For SENDER scope, use the exact sender email from the context.
${domainRuleLine}- For TOPIC scope, use a short stable topic phrase such as "pricing" or "refunds".
- Always include a scopeValue field. Use an empty string for GLOBAL scope.
- Prefer matching an existing memory over creating a new one when the existing memory substantially covers the same durable idea, even if the wording is different.
- A single edit can match multiple existing memories, such as one factual/procedure memory and one style preference. Return every matching id that is useful evidence for the edit, up to the maximum.
- If any existing memory already captures a durable idea from the edit, return its id in matchingExistingMemoryId and set newMemory to null for that idea.
- If the edit teaches a new durable memory, set matchingExistingMemoryId to null and fill newMemory.
- Only return ids from the provided existing memory list.
- Be conservative about creating new memories. Only create a new memory when none of the provided existing memories substantially covers that durable idea.
- Work language-agnostically. The memories may be written in any language.
- If nothing durable was learned, return an empty array.`;
}
