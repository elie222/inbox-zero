---
name: changelog
description: Add a new changelog entry to docs/changelog-entries/
disable-model-invocation: true
---

# Changelog

Add changelog entries as individual files in `docs/changelog-entries/`. A GitHub Action rebuilds `docs/changelog.mdx` on merge.

## Principles

1. **User-facing only.** No infrastructure, CI, security hardening, billing internals, queue fixes, cron changes, self-hosting features, or anything users don't directly see or interact with.
2. **Lead with a headline.** Each entry has a theme name in the `description` field (e.g., "Chat Everywhere", not "v2.28"). The theme should immediately tell users what changed.
3. **One short paragraph** explaining the headline feature — what it does and why it matters. Write for end users, not developers.
4. **3–5 bullets max** for other notable improvements in that release. If you can't fill 3 bullets, roll the changes into the next entry that has a strong headline.
5. **Skip releases without a standout feature.** Not every deploy needs a changelog entry. Only write one when there's something worth headlining.
6. **Casual, clear tone.** Use "you" and "your", not "users". No jargon. No version numbers as headlines.

## Format

Create a file named `docs/changelog-entries/YYYY-MM-DD.mdx` with frontmatter + markdown:

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
4. Create a new file `docs/changelog-entries/YYYY-MM-DD.mdx` with frontmatter (`description`) and markdown content
5. Do **not** edit `docs/changelog.mdx` directly — a GitHub Action rebuilds it automatically after merge
