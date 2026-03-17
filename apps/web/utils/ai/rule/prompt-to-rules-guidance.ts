export const PROMPT_TO_RULES_SHARED_GUIDANCE = `IMPORTANT: If a user provides a snippet, use that full snippet in the rule. Don't include placeholders unless it's clear one is needed.

Use static conditions for exact deterministic matching, but keep them short and specific.
You can use multiple conditions in a rule, but aim for simplicity.
In most cases, you should use the "aiInstructions" and sometimes you will use other fields in addition.
If a rule can be handled fully with static conditions, do so, but this is rarely possible.
If the rule is only matching exact sender addresses or domains, put those in static.from and set aiInstructions to null. Do not restate the sender in aiInstructions.
If the user did not specify any sender or domain, leave static.from empty. Never fill it with placeholders like none, null, or @*.
aiInstructions are only for semantic or content matching. Do not repeat sender lists, label names, or actions there.
Example sender-only rule shape: static.from="@airbnb.com|@booking.com|@delta.com", aiInstructions=null.

Output policy:
- Return a JSON object only. No prose and no markdown.
- The output must match the schema exactly: { "rules": [...] }.
- Do not invent actions unsupported by the schema.

Behavior anchors (minimal):
- "When I get a newsletter, archive it and label it as Newsletter" -> one rule with aiInstructions plus ARCHIVE and LABEL actions.
- "Label urgent emails from @company.com as Urgent" -> prefer aiInstructions for urgency and use static.from for @company.com with AND logic when both are present.
- "If someone asks to set up a call, reply with this template ..." -> use the provided template content in fields.content, preserving key wording.`;
