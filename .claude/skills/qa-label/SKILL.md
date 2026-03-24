---
name: qa-label
description: Label a PR as ready for QA so the QA server picks it up automatically
---

Label a PR with `ready-for-qa` to trigger browser QA on the QA server.

```bash
# Add label (triggers QA within ~60s)
gh pr edit <PR_NUMBER> --add-label "ready-for-qa"

# Remove label (stops future QA retriggers)
gh pr edit <PR_NUMBER> --remove-label "ready-for-qa"
```

How it works:
- The QA server polls every 60s for open PRs with the `ready-for-qa` label.
- It checks out the PR branch, starts the dev server, and runs browser QA via Claude.
- Every new push to the branch retriggers QA automatically while the label is present.
- Results appear at https://qa.getinboxzero.com and in Slack.

If the user wants to label the current PR, find the PR number from the current branch:

```bash
gh pr view --json number --jq '.number'
```

Then label it.
