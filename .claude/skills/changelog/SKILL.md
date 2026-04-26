---
name: changelog
description: Add a new changelog entry to docs/changelog-entries/
disable-model-invocation: true
---

# Changelog

Add changelog entries as individual files in `docs/changelog-entries/`, then regenerate `docs/changelog.mdx` before opening or updating the PR.

Use a single long-lived branch for changelog automation: `automation/changelog`. The automation should update the existing open changelog PR from that branch when possible instead of opening multiple concurrent changelog PRs.

## Principles

1. **User-facing only.** No infrastructure, CI, security hardening, billing internals, queue fixes, cron changes, self-hosting features, or anything users don't directly see or interact with.
2. **Lead with a headline.** Each entry has a theme name in the `description` field (e.g., "Chat Everywhere", not "v2.28"). The theme should immediately tell users what changed.
3. **One short paragraph** explaining the headline feature — what it does and why it matters. Write for end users, not developers.
4. **3–5 bullets max** for other notable improvements in that release. If you can't fill 3 bullets, roll the changes into the next entry that has a strong headline.
5. **Skip releases without a standout feature.** Not every deploy needs a changelog entry. Only write one when there's something worth headlining.
6. **Casual, clear tone.** Use "you" and "your", not "users". No jargon. No version numbers as headlines.

## Format

Create or update `docs/changelog-entries/YYYY-MM-DD.mdx` with frontmatter + markdown:

```mdx
---
description: "Headline Theme"
---

One or two sentences about the main feature.

- Bullet one
- Bullet two
- Bullet three
```

The date is derived from the filename automatically.

Do not hand-edit `docs/changelog.mdx`. Regenerate it with `node docs/scripts/build-changelog.mjs`.

## What to include

- New features users can try
- Meaningful UX improvements they'll notice
- New platform/integration support

## What to skip

- Bug fixes (unless they were widely reported)
- Security hardening (unless there was a public incident)
- Infrastructure, performance, CI/CD changes
- Billing or pricing internals
- Self-hosting or developer-only changes
- Internal refactors, lint fixes, dependency updates

## Process

1. Review recent merged PRs: `gh pr list --repo elie222/inbox-zero --state merged --limit 30 --json number,title,mergedAt`
2. Filter to user-facing changes only
3. Group into a theme — find the headline
4. Check for an existing open changelog PR from `automation/changelog` to `main`: `gh pr list --repo elie222/inbox-zero --head automation/changelog --base main --state open --json number,title,url`
5. Create or update today's file `docs/changelog-entries/YYYY-MM-DD.mdx` with frontmatter (`description`) and markdown content
6. If today's file already exists, merge the new updates into that file instead of creating a second entry for the same day
7. Regenerate `docs/changelog.mdx`: `node docs/scripts/build-changelog.mjs`
8. Commit both `docs/changelog-entries/YYYY-MM-DD.mdx` and `docs/changelog.mdx`
9. If the open PR from `automation/changelog` exists, update that branch and PR; otherwise create it from `automation/changelog`

## Branch workflow

Before making changes, reset the automation branch to the latest `main` so each run starts from a clean base:

```bash
git fetch origin
git checkout -B automation/changelog origin/main
```

After updating the changelog files, push that branch and create or update the PR from `automation/changelog` to `main`.
