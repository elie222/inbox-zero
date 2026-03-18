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

   > Fetch all PR comments (code review + conversation). Use these commands:
   > ```
   > PR_NUM=$(gh pr view --json number --jq .number)
   > REPO=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
   > # Code review comments — get all top-level (non-reply) comments with IDs
   > gh api "repos/$REPO/pulls/$PR_NUM/comments" --jq '[.[] | select(.in_reply_to_id == null) | {id, body: .body[0:300], author: .user.login, created_at, path: .path}]'
   > # Check which have replies already
   > gh api "repos/$REPO/pulls/$PR_NUM/comments" --jq '[.[] | select(.in_reply_to_id != null) | .in_reply_to_id] | unique'
   > # Conversation comments
   > gh pr view --json comments --jq '.comments[] | {id, body, author: .author.login}'
   > ```
   > Ignore bot accounts (vercel, dependabot, github-actions, etc.).
   >
   > ## How to handle comments
   > For each top-level comment that does NOT have a reply yet:
   > 1. **Evaluate the suggestion** using your own judgment. AI review bots (e.g. cubic-dev-ai, coderabbit, copilot, baz-reviewer) do NOT have full project context — their suggestions may be wrong.
   > 2. **If valid and worth fixing**: fix the code and reply confirming the fix.
   > 3. **If valid but out of scope**: reply explaining why (e.g. pre-existing pattern, low priority, will address in follow-up).
   > 4. **If invalid or wrong**: reply explaining why you disagree.
   > 5. **Always reply** to every comment so there's a clear record. Do NOT auto-resolve threads — let the reviewer handle resolution.
   >
   > A comment is "addressed" when it has a reply (from us). Check the replied-to IDs list to know which are done.
   >
   > ## Exit condition — only cancel this task when ALL are true:
   > 1. Every top-level comment has a reply (compare comment IDs vs replied-to IDs).
   > 2. You did NOT push any fixes in this iteration (if you pushed, wait at least TWO more iterations — checks take time to start and complete).
   > 3. All reviewer check runs **for the latest commit** have completed. Do NOT use `gh pr checks` (it can show stale results). Instead:
   >    ```bash
   >    HEAD_SHA=$(gh pr view --json headRefOid --jq .headRefOid)
   >    # Find incomplete checks for this exact commit
   >    gh api "repos/$REPO/commits/$HEAD_SHA/check-runs" --jq '[.check_runs[] | select(.status != "completed") | {name: .name, status: .status}]'
   >    # Also verify reviewer bots ran on THIS commit (not a previous one)
   >    gh api "repos/$REPO/commits/$HEAD_SHA/check-runs" --jq '[.check_runs[] | select(.name == "Baz Reviewer" or .name == "cubic · AI code reviewer") | {name: .name, status: .status, conclusion: .conclusion}]'
   >    ```
   >    If reviewer bots show no results for this SHA, they haven't started yet — wait.
   > If any condition is false, wait for the next iteration.

3. Confirm to the user: "Watching PR #X every {interval}. I'll address new comments automatically and stop when everything is handled."
