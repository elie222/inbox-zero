---
name: pr-watch
description: Start a background loop that monitors PR for new review comments and addresses them.
argument-hint: "[--interval 5m]"
disable-model-invocation: true
---

# PR Watch

Monitor the current PR for new review comments in the background using `/loop`.

Parse `$ARGUMENTS` for options:
- `--interval N` → loop interval (default: `5m`)

## Setup

1. Confirm there's an open PR:
   ```bash
   gh pr view --json number --jq .number
   ```

2. Create a loop with `CronCreate` using the parsed interval and this prompt:

   > Check if the current PR has new comments that haven't been addressed yet. Ignore bot accounts (vercel, dependabot, github-actions, etc.). Fetch both code review comments and conversation comments.
   >
   > - If there are unaddressed comments: run /address-pr-comments to address them. Do NOT auto-resolve threads — let the reviewer handle resolution.
   > - **Exit condition — only cancel this task when ALL of the following are true:**
   >   1. No new comments you haven't already seen and addressed.
   >   2. You did NOT push any fixes in this iteration (if you pushed, reviewers need time to re-review — always wait at least one more iteration).
   >   3. All reviewer check runs have completed — run `gh pr checks` and verify no reviewer checks (e.g. "Baz Reviewer", "cubic · AI code reviewer") are pending or in_progress. If any reviewer check is still running, they haven't finished posting comments yet — wait for the next iteration.
   >   If any condition is false, let the cron run for another iteration instead of cancelling.
   >
   > Important: AI review bots (e.g. cubic-dev-ai, coderabbit, copilot) do NOT have full context of the project. Use your own judgment — their suggestions may be wrong or inapplicable. Don't blindly implement bot feedback.

3. Confirm to the user: "Watching PR #X every {interval}. I'll address new comments automatically and stop when everything is handled."
