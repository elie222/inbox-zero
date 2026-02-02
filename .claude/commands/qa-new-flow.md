---
description: Create a new browser QA flow file from the template
---

You are creating a new browser QA flow spec in `qa/browser-flows`.

Args: $ARGUMENTS

If no args or `--help` is present, print usage and stop.

Usage:
- `/qa-new-flow --id=flow-id --title="Short title" --description="What it verifies" --resources=assistant-settings,conversation-rules --parallel-safe=false`
- Optional: `--category=settings --estimated-duration=60s --requires=authenticated_session,gmail_account --conflicts-with=other-flow-id`

Steps:
1. Collect required fields (`id`, `title`, `description`, `resources`, `parallel_safe`).
   - If any are missing, ask the user for them before proceeding.
2. Ensure `id` is a URL-safe slug (lowercase, numbers, dashes only) and matches the filename.
3. Create `qa/browser-flows/<id>.md` using `qa/browser-flows/_template.md` as a base.
4. Replace the template front matter with the provided values.
5. If optional fields are provided (`category`, `estimated_duration`, `requires`, `conflicts_with`, `timeout_minutes`, `tags`), include them.
6. Leave the section bodies as editable placeholders if the user does not provide step details.
7. Confirm the file path and next steps to edit the flow.

Do not overwrite an existing flow file without explicit confirmation.
