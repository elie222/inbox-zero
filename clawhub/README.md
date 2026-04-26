# ClawHub / OpenClaw + Cursor

This folder is the **canonical** packaged skill for the Inbox Zero API CLI (`@inbox-zero/api`, binary `inbox-zero-api`).

- **OpenClaw**: publish or install from here; see `inbox-zero-api/SKILL.md` frontmatter `metadata.openclaw`.
- **Cursor Directory**: the repo root includes `.cursor-plugin/plugin.json`. Skills are exposed via `skills/inbox-zero-api` → symlink to this directory so Open Plugins discovery finds `skills/*/SKILL.md` without duplicating files.

Edit content only under `inbox-zero-api/`; the Cursor plugin picks it up automatically.
