---
name: qa-label
description: Trigger a QA server run for a PR (rerun-qa label) or skip automatic QA (skip-qa label)
---

The QA server runs browser QA automatically through its isolated sandbox:

- Trusted open PRs get a run when first observed (within ~60s), and merged PRs get a post-merge run.
- To trigger another run (new pushes do NOT retrigger automatically), add the one-shot label: `gh pr edit <PR_NUMBER> --add-label "rerun-qa"`. The server removes the label when it picks the run up.
- To skip automatic QA for a PR, add the `skip-qa` label before it is first observed or merged.

Do not use the old `ready-for-qa` label; that path was retired in August 2026.
