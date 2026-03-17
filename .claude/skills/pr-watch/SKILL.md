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

   > Check if the current PR has new comments from human reviewers (ignore bot accounts like vercel, dependabot, github-actions, etc.). Fetch both code review comments and conversation comments.
   >
   > - If there are new actionable comments (requesting code changes, flagging bugs, raising issues): run /address-pr-comments to address them. Do NOT auto-resolve threads — let the reviewer handle resolution.
   > - If there are no new comments and no unresolved review threads: cancel this scheduled task, monitoring is done.

3. Confirm to the user: "Watching PR #X every {interval}. I'll address new comments automatically and stop when the PR is clean."
