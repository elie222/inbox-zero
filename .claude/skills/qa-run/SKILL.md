---
name: qa-run
description: Run browser QA flows and write a JSON report
---

You are the browser QA flow orchestrator. Use the flow specs in `qa/browser-flows` to execute tests in a real browser.

Args: $ARGUMENTS

If no args or `--help` is present, print usage and stop.

Usage:
- `/qa-run --list`
- `/qa-run --all [--parallel] [--max-parallel=3]`
- `/qa-run --only=flow-a,flow-b [--parallel] [--max-parallel=3]`
- `/qa-run --group=api [--parallel]`
- `/qa-run --all --base-url=http://localhost:3000`

Base URL:
- `--base-url=<url>` sets the Inbox Zero app URL (e.g. `http://localhost:3000`, `https://www.getinboxzero.com`, or any self-hosted URL).
- If `--base-url` is NOT provided, **ask the user** which URL to test against before proceeding. Do not assume production or localhost.
- When flows say "Open the Assistant settings page", navigate to `<base-url>/<account-id>/automation` etc.
- Gmail/Outlook URLs (mail.google.com, outlook.live.com) are unaffected by this flag.

Filtering:
- By default (without `--all` or `--only`), only `priority: high` flows run. Low-priority flows are skipped.
- `--all` includes all flows regardless of priority.
- `--only=flow-a,flow-b` runs exactly the specified flows regardless of priority.
- `--group=<name>` filters to flows matching that `group` front matter value. Combinable with priority filtering.

Process:
1. Read `qa/browser-flows/README.md` and the selected flow files.
2. If `--list`, print each flow id + title + group + priority + resources and stop.
3. Determine run mode (`all`, `only`, or default high-priority). Apply `--group` filter if present. Fail fast if any requested ids are missing.
4. If `--parallel`, batch flows so no batch contains overlapping `resources`, no flow lists another in `conflicts_with` (missing means none), and every flow in the batch has `parallel_safe: true` (missing means false).
   If batching is not possible, run sequentially.
5. Execute each flow exactly as written. Use deliberate waits when moving between Gmail, Outlook, and Inbox Zero.
6. Record evidence. Capture at least one screenshot for every failed flow and include it in the report.
7. Write the JSON report to `qa/browser-flows/results/<run-id>.json` and save screenshots under
   `qa/browser-flows/results/<run-id>/`.
8. Write a companion Markdown summary to `qa/browser-flows/results/<run-id>.md` following the template in the README.
9. Print a concise summary in chat with pass/fail counts and the report path.

Output rules:
- Use the JSON schema described in `qa/browser-flows/README.md`.
- Keep reports free of secrets. Use placeholders for sensitive values.
- If a flow is blocked due to missing logins or environment issues, mark it as `failed` and explain why.
- If a flow fails, specify which step failed and add the reason for failing.

Behavior rules:
- Do not invent steps. Follow each flow spec exactly.
- If a flow includes Cleanup steps, perform them unless a failure makes cleanup impossible (note this in the report).
- Do not modify unrelated settings.
