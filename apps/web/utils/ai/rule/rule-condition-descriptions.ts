export const AI_INSTRUCTIONS_PROMPT_DESCRIPTION =
  'Prompt for the AI to decide when to apply the rule. Use this for semantic or content-based matching, for example "emails about product updates" or "messages discussing project deadlines". Leave it empty or null when static.from/to/subject fully capture the rule, especially for sender-only or domain-only matching. Do not restate sender lists, label names, or actions here.';

export const STATIC_FROM_CONDITION_DESCRIPTION =
  "Exact sender address or domain matching. Use a single sender/domain or a small | separated list like @airbnb.com|@booking.com|@delta.com. Prefer this for sender-only or domain-only rules instead of aiInstructions.";
