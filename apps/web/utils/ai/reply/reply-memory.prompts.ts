import { PROMPT_SECURITY_INSTRUCTIONS } from "@/utils/ai/security";

export function getReplyMemoryExtractionSystemPrompt(options: {
  maxMemoriesPerEdit: number;
}) {
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
- Return at most ${options.maxMemoriesPerEdit} memories.
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

export const learnedWritingStyleSystemPrompt = `You maintain a compact learned writing-style summary for an email user based on accumulated style memories from prior draft edits.

${PROMPT_SECURITY_INSTRUCTIONS}

Return a concise prompt-ready style guide that helps draft future emails.

Rules:
- Summarize repeated style patterns, not one-off instructions.
- Focus on directness, verbosity, greeting habits, sign-off habits, paragraph structure, formatting, and how much filler the user removes.
- Keep it under 1500 characters.
- Include two sections exactly:
  1. "Observed patterns:" with 2-5 bullets
  2. "Representative edits:" with 2-3 short bullets
- Representative edits should be short paraphrases of draft-to-send changes, not full email quotes.
- Do not mention names, email addresses, company names, phone numbers, dates, links, or other identifying details.
- This learned summary is advisory and should complement, not replace, explicit user-written style settings.`;

export function getReplyMemoryExtractionPrompt({
  senderEmail,
  senderDomain,
  incomingEmailContent,
  draftText,
  sentText,
  existingMemories,
  learnedWritingStyle,
  userInfoPrompt,
}: {
  senderEmail: string;
  senderDomain: string;
  incomingEmailContent: string;
  draftText: string;
  sentText: string;
  existingMemories: string;
  learnedWritingStyle: string | null;
  userInfoPrompt: string;
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
${existingMemories}
</existing_memories>

${learnedWritingStylePrompt}

${userInfoPrompt}

Extract reusable reply memories from this draft edit.`;
}

export function getLearnedWritingStylePrompt({
  styleMemoryEvidence,
  userInfoPrompt,
}: {
  styleMemoryEvidence: string;
  userInfoPrompt: string;
}) {
  return `<style_memory_evidence>
${styleMemoryEvidence}
</style_memory_evidence>

${userInfoPrompt}

Summarize the user's learned writing style from this evidence.`;
}
