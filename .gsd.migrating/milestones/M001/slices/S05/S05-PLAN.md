# S05: Rules Management UI

**Goal:** Verify the existing rules UI works correctly for this single-tenant setup, guard conversation-rule toggles from accidental disable, and add a friendly /rules entry point so the page is easily reachable without knowing the emailAccountId URL.
**Demo:** Create a new rule via UI, verify it fires on next matching email

## Must-Haves

- Create a new rule via the UI; verify it fires on a matching email. Conversation-status rules (TO_REPLY, AWAITING_REPLY, FYI, ACTIONED) cannot be toggled off via the rules list switch. /rules redirects to the correct automation page for the authenticated user.

## Proof Level

- This slice proves: Manual browser verification against production (inbox.tdfurn.com)

## Verification

- Run the task and slice verification checks for this slice.

## Tasks

- [x] **T01: Guard conversation-rule toggles in Rules.tsx** `est:30m`
  Disable the enabled/disabled Switch for rules where isConversationStatusType(rule.systemType) is true. These four rules (TO_REPLY, AWAITING_REPLY, FYI, ACTIONED) must stay enabled — the reply-tracker breaks if they are toggled off. Add a tooltip explaining why the toggle is locked.
  - Files: `apps/web/app/(app)/[emailAccountId]/assistant/Rules.tsx`
  - Verify: Inspect the Switch element in browser dev tools for the TO_REPLY rule — disabled attribute must be present. Click attempt does nothing.

- [x] **T02: Add /rules redirect route** `est:45m`
  Create a server-side redirect at /rules (or /rules/page.tsx under (app)) that resolves the authenticated user's primary emailAccountId and redirects to /[emailAccountId]/automation?tab=rules. This avoids needing to hardcode or remember the account ID in the URL. Use the existing auth session utilities to get the account.
  - Files: `apps/web/app/(app)/rules/page.tsx`
  - Verify: Navigate to inbox.tdfurn.com/rules in browser — lands on automation/rules tab without typing the account ID.

- [ ] **T03: Smoke-test rule CRUD in production** `est:20m`
  Manually verify the full rules flow against production: (1) create a new test rule via the UI, (2) confirm it appears in the rules list, (3) edit the rule name, (4) delete the rule. Also confirm the 4 conversation rules are listed and their toggles are locked after T01.
  - Verify: Rule count in DB matches UI; no 500s in server logs.

## Files Likely Touched

- apps/web/app/(app)/[emailAccountId]/assistant/Rules.tsx
- apps/web/app/(app)/rules/page.tsx
