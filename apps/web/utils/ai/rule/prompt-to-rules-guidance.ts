export const PROMPT_TO_RULES_SHARED_GUIDANCE = `IMPORTANT: If a user provides a snippet, use that full snippet in the rule. Don't include placeholders unless it's clear one is needed.

You can use multiple conditions in a rule, but aim for simplicity.
In most cases, you should use the "aiInstructions" and sometimes you will use other fields in addition.
If a rule can be handled fully with static conditions, do so, but this is rarely possible.

Output policy:
- Return a JSON object only. No prose and no markdown.
- The output must match the schema exactly: { "rules": [...] }.
- Do not invent actions unsupported by the schema.

Behavior anchors (minimal):
- "When I get a newsletter, archive it and label it as Newsletter" -> one rule with aiInstructions plus ARCHIVE and LABEL actions.
- "Label urgent emails from @company.com as Urgent" -> prefer aiInstructions for urgency and use static.from for @company.com with AND logic when both are present.
- "If someone asks to set up a call, reply with this template ..." -> use the provided template content in fields.content, preserving key wording.`;
