export const AI_INSTRUCTIONS_PROMPT_DESCRIPTION =
  'Prompt for the AI to decide when to apply the rule. Use this only for semantic or content-based matching, for example "emails about product updates" or "messages discussing project deadlines". If static.from already lists the exact senders or domains and that fully defines the match, set this to null. For example, if static.from is "@sender.com", aiInstructions must be null, not "Emails from @sender.com". If the user combines exact senders with semantic intent, keep only the semantic part here. For example, use static.from="@partner-updates.example" with aiInstructions="urgent vendor updates". Do not restate sender lists, label names, or actions here.';

export const STATIC_FROM_CONDITION_DESCRIPTION =
  "Exact sender address or domain matching. Use a single sender/domain or a small | separated list like @airbnb.com|@booking.com|@delta.com. A sender-only or domain-only rule should be fully represented here, with aiInstructions set to null. Leave it empty when the user did not specify any sender or domain. Do not fill this with placeholders like none, null, none@none.com, @company.com, or *@*.*. If a matching category rule already exists and the user is adding or removing recurring senders, use learned patterns instead.";

const invalidStaticFromPlaceholderValues = new Set([
  "none",
  "null",
  "none@none.com",
  "*",
  "@",
  "*@*",
  "*@*.*",
]);

export const INVALID_STATIC_FROM_PLACEHOLDER_MESSAGE =
  "Leave static.from empty instead of using placeholder or catch-all values like 'none', 'null', or '*@*.*'.";

export function isInvalidStaticFromPlaceholder(
  value: string | null | undefined,
) {
  if (!value) return false;

  return value
    .split(/[|,\n]/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .some((part) => invalidStaticFromPlaceholderValues.has(part));
}
