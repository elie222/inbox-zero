---
description: Create a new browser QA flow file from the template
---

You are creating a new browser QA flow spec in `qa/browser-flows`.

Args: $ARGUMENTS

If no args or `--help` is present, print usage and stop.

Usage:
- `/qa-new-flow --id=flow-id --title="Short title" --resources=assistant-settings,conversation-rules --goal="What it verifies"`
- Optional: `--parallel-safe=true --conflicts-with=other-flow-id,another-flow-id --preconditions="Signed in" --cleanup="Remove test rule"`

Steps:
1. Collect required fields (`id`, `title`, `resources`).
   - If any are missing, ask the user for them before proceeding.
2. Ensure `id` is a URL-safe slug (lowercase, numbers, dashes only) and matches the filename.
3. Create `qa/browser-flows/<id>.md` using `qa/browser-flows/_template.md` as a base.
4. Replace the template front matter with the provided values.
5. If optional fields are provided (`parallel_safe`, `conflicts_with`), include them in the front matter.
   - Always serialize `conflicts_with` as a YAML list by splitting the `--conflicts-with` value on commas (even for a single id).
6. If `--goal` is provided, replace the Goal section placeholder with it.
7. If `--preconditions` is provided, replace the existing `Preconditions` section placeholder list with those items.
8. If `--cleanup` is provided, replace the Cleanup section placeholder with it.
9. Leave the other section bodies as editable placeholders if the user does not provide step details.
10. Confirm the file path and next steps to edit the flow.

Do not overwrite an existing flow file without explicit confirmation.
