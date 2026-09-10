---
name: create-pr
description: Review the working tree, commit it safely, and open a GitHub pull request. Use when the user asks to create, open, raise, or publish a PR, or to finish changes as a PR. For watching an existing PR — CI, review bots, failures, comments — use the pr-watch skill instead.
---

# Open a pull request

Get the change reviewed, committed with public-safe metadata, and published.
Opening the PR is not the end of the job: hand off to `pr-watch` unless the user
opted out of monitoring.

## Boundaries

- Use public-safe metadata. Never expose non-public personal data, account IDs,
  tokens, secrets, or other sensitive information in a branch name, commit
  message, or PR body. Public GitHub identities already on the PR may be
  referenced when a reply needs them.
- Mention related work in private repositories or services only generically,
  such as "updated the marketing repository," without internal details.
- If the branch already has a PR and the user asks to monitor or fix it, skip
  creation entirely and use `pr-watch`.

## 1. Inspect and review

Read `AGENTS.md`, then inspect the current branch, status, and diff:

```bash
git branch --show-current && git status --short && git diff HEAD --stat
```

Before publishing, review the diff for correctness, security, test gaps, and
repository conventions. Fix high-confidence bugs and mechanical issues. Do not
expand the requested scope for optional refactors.

Run focused validation appropriate to the changed files — the unit tests that
cover them, a type check, the linter. Do not run builds or broad test suites
when repository instructions prohibit them or the user did not request them. CI
runs the full suites on the PR anyway, so duplicating them locally buys nothing
and costs a great deal of time.

## 2. Branch, commit, and push

Create a dedicated branch when on the base branch or when the current branch
does not belong to these changes. Use a public-safe `feat/`, `fix/`, or `chore/`
name unless repository instructions require another prefix.

Respect the user's staged selection. Otherwise stage explicit paths, never
`git add .`:

```bash
git add <file1> <file2>
git commit -m "<public-safe summary>"
git push -u origin <branch>
```

If there is nothing new to commit, confirm the branch is already pushed before
continuing.

## 3. Create the PR

First check whether the branch already has one, and do not create a duplicate:

```bash
gh pr view --json number,url,headRefName,headRefOid
```

For a new PR, use this public-safe format:

```text
<area>: <Title under 80 characters>

<One- or two-sentence summary>

- concrete change
- concrete validation or behavior
```

```bash
gh pr create --title "<title>" --body "<body>"
```

Display the PR link and branch. In the final response, include a concise
performance note covering runtime work, database or network calls, and hot-path
risk when relevant.

## 4. Hand off to the watch

If the user requested `skip review` or `#skipreview`, post that marker and stop.

Otherwise start the watch in the same turn you created the PR — do not stop to
report first. Opening a PR is not completing it, and a report delivered while
checks are still running is a report of nothing:

```bash
# run_in_background: true
"$(git rev-parse --show-toplevel)/.claude/skills/pr-watch/pr-digest" --watch
```

That call blocks until the checks on this commit are terminal and then prints a
digest ending in a `VERDICT` line. Read `.claude/skills/pr-watch/SKILL.md` for
how to act on each verdict, triage a failing job, and answer review comments.

Starting the command matters more than remembering the skill: once it is
running, its output tells you what to do next even if nothing reminded you.
