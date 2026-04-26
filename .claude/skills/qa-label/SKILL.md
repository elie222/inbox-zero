---
name: qa-label
description: Label a PR as ready for QA so the QA server picks it up automatically
---

To mark a PR ready for QA, run: `gh pr edit <PR_NUMBER> --add-label "ready-for-qa"`

An automated QA process on the QA server will pick it up within ~60s and run browser tests against the PR branch. New pushes retrigger automatically while the label is present.
