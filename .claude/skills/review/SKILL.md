---
disable-model-invocation: true
---

# review

Code review with craftsman's eye. Auto-fix obvious issues, surface real bugs.

Reference @AGENTS.md for project conventions. Apply those patterns as review criteria.

## Critical Rules

1. **AUTO-FIX safe obvious issues** - Don't ask permission for no-brainers
2. **HUNT FOR BUGS** - Logic errors, edge cases, race conditions first
3. **WAIT for confirmation** - On BUG/FIX, don't execute until user says "go"
4. **BE CONCISE** - One-line items, choices at END
5. **USE clickable links** - `path/to/file.ts:123` format only

## Categories

| Category | What | Action |
|----------|------|--------|
| **[BUG]** | Logic errors, security, data loss, race conditions | Report → wait |
| **[FIX]** | Type gaps, missing error handling, test gaps, slop | Report → wait |
| **[AUTO]** | Unused imports, dead code, console.log, typos | Fix immediately |
| **[CONSIDER]** | Refactors, style opinions, nice-to-have | Mention only |

### AUTO Criteria (all must be true)

- Zero risk of breaking behavior
- <5 seconds to fix
- No judgment call needed

**AUTO examples:**
- Unused imports/variables
- Trailing whitespace
- Console.log (unless intentional)
- Dead/unreachable code
- Obvious typos in comments/strings

**NOT AUTO (needs confirmation):**
- Removing "unused" function (might be used elsewhere)
- Type changes (might change behavior)
- Any logic change
- AI slop removal (might be intentional)

## Project-Specific Checks

**Always ask these questions during review:**

### Can this be simpler?
- Is there unnecessary abstraction? Could this be done with less code?
- Are there helpers/utils being created for one-time operations?
- Over-engineered error handling, feature flags, or backwards-compat shims?
- Unnecessary wrapper components or HOCs?

### Can we remove any code?
- Dead code, unused exports, commented-out blocks?
- Re-exports or barrel files (we don't use barrel files)?
- Backwards-compatibility hacks like renamed `_vars` or `// removed` comments?
- Types/interfaces exported but only used in the same file?

### Is it DRY without premature abstraction?
- Obvious copy-paste of entire functions or large blocks → refactor
- But 2-3 similar lines are fine — don't abstract too early
- The wrong abstraction is worse than duplication

### Is it structured correctly?
- **Colocate page-specific components** next to their page (not in a nested `components/` subfolder — we don't do that in route directories)
- **General/reusable components** go in `apps/web/components/`
- **API routes**: One resource per route, not combined data endpoints
- **Server actions** for mutations, not POST routes
- **Validation schemas** in separate `.validation.ts` files
- **Helper functions** at the bottom of files, not the top
- **All imports** at the top — no mid-file dynamic imports
- **No barrel files** (index.ts re-exporting everything from a folder)

### Does it follow project patterns? (see @AGENTS.md)
- GET routes wrapped with `withAuth` or `withEmailAccount`?
- Response types exported as `Awaited<ReturnType<typeof fn>>`?
- SWR for client-side data fetching?
- `LoadingContent` for loading/error states?
- `useAction` from `next-safe-action/hooks` for form submissions?
- Zod schemas with `z.infer<typeof schema>` instead of duplicate interfaces?
- Self-documenting code? Comments explain "why" not "what"?
- `logger.trace()` for PII fields?
- Test changes follow `.claude/skills/testing/SKILL.md`?
- Tests avoid mocking `@/utils/logger`?

### Learnings check
- Did this change teach us something that should be captured in `AGENTS.md` or this review file?
- Are there patterns that keep coming up that we should document?

## Mindset

**Inheritance Test:** Would I curse the previous author? Understand at 2am?

**Pride Test:** Would I put my name on this?

## Workflow

### Step 0: Determine Scope & Group Files

Auto-detect: conversation changes → staged → current diff

```bash
git diff --cached --name-only  # or HEAD
```

**Group files by area/dependency:**
```
Batch 1: apps/web/app/api/agent/* (3 files)
Batch 2: apps/web/app/(app)/[emailAccountId]/agent/* (related components)
Batch 3: apps/web/utils/actions/* (2 files)
```

**Output:** `Found X files in Y batches`

──────────

### Step 1: Create Review Plan (TODO)

**BEFORE reading any file content**, create todo list:

```
- [ ] Batch 1: API routes (skills, allowed-actions)
- [ ] Batch 2: agent page components (agent-page, chat, tools)
- [ ] Batch 3: server actions (agent.ts, agent.validation.ts)
```

Use `todo_write` to track batches.

──────────

### Step 2: Process Each Batch

**For each batch:**

1. Read diff for batch files only (`git diff --cached -- path/to/files`)
2. Review & categorize issues
3. Auto-fix [AUTO] items immediately
4. Note [BUG]/[FIX]/[CONSIDER] items
5. Mark batch complete in todos

**Issue format:**
```
1. **[BUG]** Race condition in concurrent saves — `src/db.ts:45`
2. **[FIX]** Missing error boundary — `src/App.tsx:12`
3. **[CONSIDER]** Extract to custom hook — `src/Form.tsx:34`
```

**After each batch:**
```
Batch 1 done: AUTO: 2 fixed | BUG: 1 | FIX: 2
```

──────────

### Step 3: Summary & Options (After All Batches)

```
Total: BUG: X | FIX: X | CONSIDER: X (auto-fixed: Y)

Issues:
1. [BUG] ... — `path:line`
2. [FIX] ... — `path:line`

What to fix?
- a) BUG + FIX [recommended]
- b) BUG only
- c) All including CONSIDER
- d) Custom (e.g., "1,3")

I'll assume a) if you don't specify.

Learnings:
- Any patterns worth adding to AGENTS.md?
- Any new review checks to add to this file?
```

**STOP. Wait for selection.**

──────────

### Step 4: Execute Fixes

Process fixes batch-by-batch (same grouping):

1. Update todo list with selected fixes
2. For each batch:
   - Read relevant file(s)
   - Apply fixes
   - Mark complete
3. Run linter if applicable

## Severity Guide

**BUG (Logic/Security):**
- Business logic errors, wrong conditions
- Race conditions, data loss
- Security: injection, XSS, exposed secrets
- API routes missing auth middleware
- Null/undefined not handled
- Edge cases that break

**FIX (Quality):**
- Type safety gaps, unsafe casts
- Missing error handling
- Test coverage gaps
- AI slop (WHAT comments, unnecessary try/catch, `as any`)
- Missing validation
- Combined API routes that should be separate
- POST routes used for mutations instead of server actions
- Barrel files / re-export patterns

**CONSIDER (Opinions):**
- Refactoring opportunities
- "I would do it differently"
- Performance micro-optimizations
- Style preferences

## Git Commands

```bash
# Staged
git diff --cached
git diff --cached --name-only

# All uncommitted
git diff HEAD
git diff HEAD --name-only
```

## Error Handling

| Error | Response |
|-------|----------|
| No changes | "Check git status or specify files" |
| File not found | List available, ask to specify |
| Binary files | Skip, mention in summary |
| Large file (>10k) | "Review specific sections?" |
