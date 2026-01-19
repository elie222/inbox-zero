# Agent Instructions

## Branch Strategy

**IMPORTANT: This is rsnodgrass's fork of inbox-zero.**

- **`main` branch**: rsnodgrass's customized main. **NEVER create PRs from this branch to upstream.**
- **`plugins` branch**: Active development branch for plugin SDK work.
- **Feature branches**: Use feature branches for any work intended to be submitted upstream.

**For upstream contributions:**
1. Create a feature branch from `upstream/main` (not from `main`)
2. Make changes on the feature branch
3. Submit PR from feature branch to `upstream/main`

**For local customizations:**
- Work on `main` or `plugins` branch
- These stay in the fork and sync from upstream via `.github/workflows/sync-upstream.yml`

---

This project uses **bd** (beads) for issue tracking. Run `bd onboard` to get started.

## Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --status in_progress  # Claim work
bd close <id>         # Complete work
bd sync               # Sync with git
```

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds

