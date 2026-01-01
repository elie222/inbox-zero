# polish

Remove AI slop and lint errors from branch. Autonomous, no confirmation.

## Critical Rules

1. **ONLY remove slop** — No refactoring, no "improvements"
2. **ONLY fix lint/type errors** — Not style preferences
3. **NEVER change logic** — Even if "better" way exists
4. **NEVER touch unrelated code** — Only files in branch diff
5. **BATCH processing** — Don't read all files at once, process in groups

## Slop Reference

| Remove | Keep |
|--------|------|
| WHAT comments (`// increment counter`) | WHY comments |
| `as any` type bypasses | Legitimate assertions with reason |
| Defensive try/catch in internal code | Error handling at API boundaries |
| Null checks for non-nullable types | Boundary validation |
| Console.logs added for debugging | Intentional logging |

**Skip if uncertain.** When in doubt, leave it.

──────────

## Workflow

### Step 0: Get Changed Files + Create TODO

```bash
git diff main...HEAD --name-only
```

Group files by directory/feature area. Create TODO list:
- One item per group (2-4 related files)
- Mark first group as `in_progress`

──────────

### Step 1: Process Each Group

For current group:

1. **Read diffs only** (not full files):
   ```bash
   git diff main...HEAD -- path/to/file1 path/to/file2
   ```

2. **Apply fixes** — Remove slop, fix lint errors

3. **Mark group complete** — Move to next

Repeat until all groups done.

──────────

### Step 2: Final Lint Check

Run project's lint command on changed files only.

Fix remaining errors in scope.

──────────

### Step 3: Summary

```
Polished X files:
- [file]: removed Y comments, fixed Z lint errors
- [file]: removed `as any`
```

If nothing to polish: "Branch is clean."
