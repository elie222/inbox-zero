# Browser QA Flows (Claude Code)

These files are human-readable browser QA flows meant to be executed by Claude Code with browser automation.
Each file is a single flow; the Claude slash commands in `.claude/commands` orchestrate running them and
writing a consistent results file.

## Folder layout

```
qa/browser-flows/
  README.md
  _template.md
  assistant-writing-style.md
  to-reply-rule-outlook-to-gmail.md
  results/
    README.md
```

## Flow file format

Each flow is a Markdown file with YAML front matter and core sections.

**Filename:** `qa/browser-flows/<id>.md`

**Front matter fields:**

- `id` (required) Unique slug for the flow. Must match filename.
- `title` (required) Short, human-friendly name.
- `description` (required) 1-2 sentence summary of what the flow validates.
- `category` (optional) Short bucket like `settings`, `rules`, `email`, `integration`.
- `estimated_duration` (optional) Rough runtime like `30s`, `60s`, `120s`, `180s`.
- `resources` (required) List of shared resources that this flow mutates or depends on.
  - Examples: `assistant-settings`, `conversation-rules`, `gmail-account`, `outlook-account`.
- `requires` (optional) Capabilities or accounts needed (e.g., `authenticated_session`, `gmail_account`).
- `conflicts_with` (optional) Flow ids that should not run in parallel.
- `parallel_safe` (required) `true` only if the flow can run in parallel with other flows that touch
  different resources.
- `timeout_minutes` (optional) Soft limit for the flow.
- `preconditions` (optional) List of prerequisites (logged in, feature flags, etc.).
- `cleanup` (optional) List of cleanup actions if the flow modifies state.
- `tags` (optional) Short labels to help filtering.

**Core sections (required):**

1. `Goal`
2. `Steps`
3. `Expected results`
4. `Cleanup` (can be `None` if not needed)

**Optional sections:**

- `Failure indicators`

## Parallelization rules

When running with `--parallel`, only run flows together if **all** of these are true:

- Their `resources` lists do not overlap.
- No flow lists another flow in `conflicts_with`.
- Every flow has `parallel_safe: true`.

If either condition is not met, run the flow in a separate batch.

## Output format

Claude Code should write a JSON report to `qa/browser-flows/results/<run-id>.json`.

**Schema (example):**

```json
{
  "runId": "2026-02-02T19-14-12Z",
  "startedAt": "2026-02-02T19:14:12Z",
  "endedAt": "2026-02-02T19:42:08Z",
  "mode": "all",
  "parallel": true,
  "flows": [
    {
      "id": "assistant-writing-style",
      "title": "Assistant writing style persists",
      "status": "passed",
      "startedAt": "2026-02-02T19:15:02Z",
      "endedAt": "2026-02-02T19:18:31Z",
      "durationMs": 209000,
      "reason": null,
      "evidence": {
        "notes": "Saved style persisted after refresh.",
        "screenshots": ["qa/browser-flows/results/2026-02-02T19-14-12Z/assistant-writing-style-01.png"],
        "urls": ["https://app.inboxzero.ai/assistant/settings"]
      }
    },
    {
      "id": "auto-joke-rule-cross-mailbox",
      "title": "Auto-joke rule applies label in Outlook",
      "status": "failed",
      "startedAt": "2026-02-02T19:19:10Z",
      "endedAt": "2026-02-02T19:41:54Z",
      "durationMs": 1350000,
      "reason": "Outlook message arrived without the expected label after 10 minutes.",
      "evidence": {
        "notes": "Rule created successfully in Assistant page.",
        "screenshots": ["qa/browser-flows/results/2026-02-02T19-14-12Z/auto-joke-rule-cross-mailbox-01.png"],
        "urls": ["https://outlook.office.com/mail/inbox"]
      }
    }
  ],
  "summary": {
    "passed": 1,
    "failed": 1,
    "skipped": 0
  }
}
```

Keep results free of secrets. Use placeholders for sensitive values.
