# Open a PR

Important: Steps 2 and 3 require `required_permissions: ['all']` because:
- Pre-commit hooks need access to global npm/node paths outside the workspace
- `gh` CLI has TLS certificate issues in sandboxed mode

## Step 1: Check state (ONE command)

```bash
git branch --show-current && git status -s && git diff HEAD --stat
```

- **Always create a new branch for each PR** unless you're already on the correct branch for the current changes.
- If on `main` OR if the current branch doesn't match the work you're committing: create a branch using the appropriate prefix:
  - `feat/<description>` - new features
  - `fix/<description>` - bug fixes
  - `chore/<description>` - maintenance, refactoring, etc.

```bash
git checkout -b feat/<description>
```

Note: `git checkout -b` requires `required_permissions: ['git_write']`

## Step 2: Commit + Push (`required_permissions: ['all']`)

If uncommitted changes exist:

**If staged files exist** (respect user's selection):
```bash
git commit -m "<msg>" && git push
```

**If unstaged files exist** (add specific files, NOT `git add .`):
```bash
git add <file1> <file2> ... && git commit -m "<msg>" && git push
```

## Step 3: Create PR (`required_permissions: ['all']`)

**Format:**
```
<feature_area>: <Title> (80 chars max)

<TLDR> (1-2 sentences)

- bullet 1
- bullet 2
```

**Without skip-review:**
```bash
gh pr create --title "<title>" --body "<body>"
```

**With skip-review** (user says "skip review", "#skipreview", etc.):
```bash
gh pr create --title "<title>" --body "<body>" && gh pr comment $(gh pr view --json number -q .number) --body "#skipreview"
```

Display the returned PR URL as a markdown link on its own line, formatted as: `[PR #<number>](<url>)` so it's clickable.