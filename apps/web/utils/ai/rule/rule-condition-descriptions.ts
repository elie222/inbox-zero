export const AI_INSTRUCTIONS_PROMPT_DESCRIPTION =
  'Prompt for the AI to decide when to apply the rule. Use this only for semantic or content-based matching, for example "emails about product updates" or "messages discussing project deadlines". If static.from already lists the exact senders or domains and that fully defines the match, set this to null. For example, if static.from is "@sender.com", aiInstructions must be null, not "Emails from @sender.com". If the user combines exact senders with semantic intent, keep only the semantic part here. For example, use static.from="@partner-updates.example" with aiInstructions="urgent vendor updates". Do not restate sender lists, label names, or actions here.';

export const STATIC_FROM_CONDITION_DESCRIPTION =
  "Exact sender address or domain matching. Use a single sender/domain or a small | separated list like @airbnb.com|@booking.com|@delta.com. A sender-only or domain-only rule should be fully represented here, with aiInstructions set to null. Leave it empty when the user did not specify any sender or domain. Do not fill this with placeholders like none, null, none@none.com, or *@*.*. If a matching category rule already exists and the user is adding or removing recurring senders, use learned patterns instead.";

const invalidStaticFromPlaceholderValues = new Set([
  "none",
  "null",
  "n/a",
  "na",
  "not applicable",
  "not specified",
  "unspecified",
  "none@none.com",
  "*",
  "@",
  "*@*",
  "*@*.*",
]);

export const INVALID_STATIC_FROM_PLACEHOLDER_MESSAGE =
  "Use a real sender address or domain in static.from, or leave it empty. Do not use placeholders or catch-all values.";

export const REDUNDANT_SENDER_ONLY_AI_INSTRUCTIONS_MESSAGE =
  "Set aiInstructions to null when static.from fully defines the sender match instead of repeating the sender there.";

export function isInvalidStaticFromPlaceholder(
  value: string | null | undefined,
) {
  if (!value) return false;

  return value
    .split(/[|,\n]/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .some(
      (part) =>
        invalidStaticFromPlaceholderValues.has(part) ||
        !isValidStaticFromToken(part),
    );
}

export function isRedundantSenderOnlyAiInstructions(
  aiInstructions: string | null | undefined,
  staticFrom: string | null | undefined,
) {
  if (!aiInstructions || !staticFrom) return false;

  const normalizedInstructions = aiInstructions.trim().toLowerCase();
  if (!/^(emails?|messages?)\s+from\s+/.test(normalizedInstructions)) {
    return false;
  }

  const describedSenders = splitSenderList(
    normalizedInstructions
      .replace(/^(emails?|messages?)\s+from\s+/, "")
      .replace(/\b(and|or)\b/g, "|")
      .replace(/\.$/, ""),
  );
  const staticSenders = splitSenderList(staticFrom);

  if (describedSenders.length !== staticSenders.length) return false;

  const sortedDescribedSenders = describedSenders.sort();
  const sortedStaticSenders = staticSenders.sort();

  return sortedDescribedSenders.every(
    (sender, index) => sender === sortedStaticSenders[index],
  );
}

function splitSenderList(value: string) {
  return value
    .split(/[|,\n]/)
    .map((part) => part.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

function isValidStaticFromToken(value: string) {
  return (
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value) ||
    /^@?[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(value)
  );
}
