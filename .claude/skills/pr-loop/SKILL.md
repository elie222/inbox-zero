---
name: pr-loop
description: Review, commit, create a PR, then automatically address review feedback and PR-caused check failures until the latest commit is clean.
argument-hint: "[--wait 300] [--max 5] [--timeout 1800]"
disable-model-invocation: true
---

# PR Loop

Review code, create PR, then automatically address review comments.

Parse `$ARGUMENTS` for options:
- `--wait N` → seconds between checks (default: 300)
- `--max N` → max fix-and-push rounds (default: 5)
- `--timeout N` → maximum total post-PR monitoring time in seconds (default: 1800)

Important: All `gh` CLI commands require `required_permissions: ['all']` due to TLS certificate issues in sandboxed mode.

## PII Rules (PUBLIC REPO)

**NEVER include PII in commits, PR titles/descriptions, branch names, or code comments.**
PII includes: names, email addresses, phone numbers, addresses, usernames, account IDs, API keys, tokens, passwords, or any sensitive personal data.
Commit messages describe the type of change, not specific data. Use generic terms like "user", "email", "record".

──────────

## Step 1: Add tasks to task list

Append these to the existing task list (do NOT replace tasks already there from earlier work):

1. Review changes via subagent
2. Fix review findings
3. Commit and create PR
4. Post-PR loop (wait → inspect reviews and checks → address → repeat)

──────────

## Step 2: Review changes via subagent

Use the Task tool to spin up a review subagent:

```
Task tool call:
  subagent_type: "general-purpose"
  description: "Review code changes"
  prompt: <see below>
```

**Subagent prompt must include:**
1. The output of `git diff HEAD` (or `git diff --cached` if there are staged changes)
2. The full review criteria from `.claude/skills/review/SKILL.md` (categories, severity guide, project-specific checks)
3. These instructions:
   - Categorize every issue as [BUG], [FIX], [AUTO], or [CONSIDER]
   - Auto-fix [AUTO] items directly (unused imports, dead code, console.log, typos)
   - Return a structured summary of [BUG], [FIX], and [CONSIDER] items with file:line references
   - Do NOT wait for confirmation — this is automated
   - Do NOT ask questions — fix what you can, report what you can't

──────────

## Step 3: Fix review findings

Read the subagent's output. For each finding:

- **[BUG]** → Fix immediately (no confirmation needed)
- **[FIX]** → Fix immediately (no confirmation needed)
- **[CONSIDER]** → Skip (do not implement)

If the subagent already auto-fixed [AUTO] items, verify they were applied.

──────────

## Step 4: Commit and create PR

Follow the `.claude/skills/create-pr/SKILL.md` workflow:

1. Check state:
   ```bash
   git branch --show-current && git status -s && git diff HEAD --stat
   ```

2. Create branch if on `main`:
   ```bash
   git checkout -b feat/<description>  # or fix/ or chore/
   ```

3. Stage specific files (NOT `git add .`), commit, push:
   ```bash
   git add <file1> <file2> ... && git commit -m "<generic message>" && git push -u origin <branch>
   ```

4. Create PR:
   ```bash
   gh pr create --title "<feature_area>: <Title>" --body "<TLDR + bullets>"
   ```

Display the PR URL as `[PR #<number>](<url>)` and the branch name.

──────────

## Step 5: Post-PR loop

Use `.claude/skills/review-bot-loop/SKILL.md` as the single source of truth for five-minute waits, timeout enforcement, exact-commit snapshots, bot detection, review-comment handling, fix commits, and its completion gate. Apply `.claude/skills/address-pr-comments/SKILL.md` when triaging and replying to each comment. Share this skill's `--wait`, `--max`, and `--timeout` values with that loop.

The overall `--timeout` applies even while the review-bot loop is passively waiting. When it expires, stop and report the exact unfinished reviewers, checks, statuses, or comments. Never loop indefinitely.

### Inspect all current-commit checks

The review-bot loop's exact-commit snapshot fetches every check run and combined commit status for the exact PR HEAD. Inspect those same results for failures outside the selected review bots.

Do not use `gh pr checks` or mix observations from different SHAs.

Treat `failure`, `cancelled`, `timed_out`, `action_required`, and `error` as failures. Treat `queued`, `pending`, `waiting`, and `in_progress` as incomplete. Successful, neutral, and skipped results need no action.

For each failure:

1. Open its logs or linked report. For GitHub Actions, use `gh run view <run-id> --log-failed` when available.
2. Determine whether the pull request caused it. Do not assume an infrastructure or third-party failure is a code defect.
3. If the PR caused it, implement and validate the fix automatically.
4. If it is unrelated or inaccessible, record the evidence and report it without claiming the PR is clean.

Never rerun, approve, dismiss, or mutate an external check unless that action is clearly authorized by the user's request.

### After a check fix

Stage explicit paths, commit with public-safe metadata, push, increment the shared fix-and-push count, and restart the review-bot loop for the new commit. If the fix-round budget is exhausted, report the outstanding failures or comments and exit immediately without another wait.

### Completion

Complete only when the review-bot loop's gate passes and the same exact-commit snapshot shows that every check run and commit status is terminal with no remaining failure. Incomplete non-review checks may wait only until the overall timeout; on timeout, report them and exit.
