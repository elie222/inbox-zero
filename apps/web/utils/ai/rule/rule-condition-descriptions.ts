export const AI_INSTRUCTIONS_PROMPT_DESCRIPTION =
  'Prompt for the AI to decide when to apply the rule. Use this only for semantic or content-based matching, for example "emails about product updates" or "messages discussing project deadlines". If static.from already lists the exact senders or domains and that fully defines the match, leave aiInstructions empty. For example, if static.from is "@sender.com", leave aiInstructions empty instead of writing "Emails from @sender.com". If the user combines exact senders with semantic intent, keep only the semantic part here. For example, use static.from="@partner-updates.example" with aiInstructions="urgent vendor updates". Do not restate sender lists, label names, or actions here.';

export const STATIC_FROM_CONDITION_DESCRIPTION =
  "Exact sender address or domain matching. Use a single sender/domain or a small | separated list like @airbnb.com|@booking.com|@delta.com. A sender-only or domain-only rule should be fully represented here, with aiInstructions left empty. Leave it empty when the user did not specify any sender or domain. Use real sender addresses or domains only; do not use placeholders or catch-all values. If a matching category rule already exists and the user is adding or removing recurring senders, use learned patterns instead.";

export const INVALID_STATIC_FROM_MESSAGE =
  "Use a real sender address or domain in static.from, or leave it empty. Do not use placeholders or catch-all values.";

export function isInvalidStaticFromValue(value: string | null | undefined) {
  if (!value) return false;

  return value
    .split(/[|,\n]/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .some((part) => !isValidStaticFromToken(part));
}

function isValidStaticFromToken(value: string) {
  if (value.includes("*")) return false;

  return (
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value) ||
    /^@?[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(value)
  );
}
