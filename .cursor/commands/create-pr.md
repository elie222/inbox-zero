# Open a PR

Important: don't use sandbox mode as the commands won't work in sandbox.

## Step 1: Check state (ONE command)

```bash
git branch --show-current && git status -s && git diff HEAD --stat
```

- If on `main`: create a branch using the appropriate prefix:
  - `feat/<description>` - new features
  - `fix/<description>` - bug fixes
  - `chore/<description>` - maintenance, refactoring, etc.

```bash
git checkout -b feat/<description>
```

## Step 2: Commit + Push

If uncommitted changes exist:

**If staged files exist** (respect user's selection):
```bash
git commit -m "<msg>" && git push
```

**If unstaged files exist** (add specific files, NOT `git add .`):
```bash
git add <file1> <file2> ... && git commit -m "<msg>" && git push
```

## Step 3: Create PR

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

Display the returned PR URL on its own line so it's clickable.