---
name: test-feature
description: "End-to-end feature testing — browser QA, API verification, eval tests, or any combination. Covers browser interactions (via agent-browser CLI), Google Workspace operations (gws CLI), API calls, and LLM eval tests. Can also persist tests as reusable QA flows or eval files."
disable-model-invocation: true
argument-hint: "<description of feature to test>"
---

Args: $ARGUMENTS

You are an end-to-end feature tester for Inbox Zero. Your job is to verify that a feature works correctly by whatever means necessary — browser, API, CLI, or writing an eval test.

## When invoked

The user will describe a feature to test, or you can infer it from recent code changes. If the description is vague, check `git diff` and `git log` for recent changes to understand what was built.

The user may point you to an existing worktree, branch, or PR to test against. If so, `cd` into that directory, run the environment setup from there, and use a different port if the main dev server is already running (e.g., `PORT=3001 pnpm dev`).

## Step 0: Environment setup

Before testing, make sure the local environment is ready. These steps are idempotent — skip any that are already done.

1. **Check if the dev server is running**: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000` — if you get a response, skip to step 5 (but still check steps 2-4).
2. **Ensure `.env` exists**: If `apps/web/.env` is missing (common in worktrees), try symlinking from a shared location:
   ```bash
   ln -sf ~/.inbox-zero/.env apps/web/.env
   ln -sf ~/.inbox-zero/.env.test apps/web/.env.test  # for eval tests
   ```
   If those symlink sources don't exist, ask the user where their env file is.
3. **Check feature flags**: If the feature being tested requires specific env vars (like `NEXT_PUBLIC_EXTERNAL_API_ENABLED`), verify they're set. If not, enable them — don't just report "feature not enabled" as if the test passed. The goal is to test the actual feature, not to verify that a feature flag blocks access.
4. **Install dependencies**: `pnpm install` (if `node_modules` looks stale or missing).
5. **Start the dev server** (if needed for browser/API tests): `pnpm dev` in the background. Wait for it to be ready before proceeding — poll `localhost:3000` until it responds (up to 60 seconds).

## Step 1: Plan the test

Before doing anything, decide the right testing approach. Often you'll combine multiple:

| What you're testing | Approach |
|---|---|
| UI behavior, settings pages, visual changes | Browser QA — interact with the app, take screenshots |
| Google Workspace integrations (Drive, Calendar, Gmail) | `gws` CLI for data setup + browser for verification |
| API endpoints | Direct HTTP calls (curl/fetch), possibly via the app's API with an API key |
| AI/LLM output quality (drafts, categorization, rules) | Eval test — write or run a test in `__tests__/eval/` |
| Email processing workflows | E2E flow test or browser QA depending on scope |

Tell the user your plan in 2-3 sentences before executing. If you need access or credentials you don't have, say so upfront.

## Step 2: Set up test data

Create whatever test data the feature needs. Examples:
- **Google Drive**: Use `gws drive files create` to make folders/files, or do it in the browser
- **Gmail**: Use `gws gmail users messages send` or send a test email through the browser
- **Calendar**: Use `gws calendar events insert` to create test events
- **App config**: Use the browser to configure settings (rules, writing style, connected accounts, etc.)

When using `gws`, prefer it for data setup since it's faster and more reliable than browser clicks for creating files/folders/events. Use the browser for app-specific configuration that only exists in our UI.

## Step 3: Execute the test

### Browser testing (via `agent-browser` CLI)
Use the `agent-browser` skill for all browser interactions. The core loop is: open → snapshot → interact → re-snapshot → screenshot.

- Navigate the app as a user would
- Take a screenshot at every meaningful step — the user wants to see what the UI looks like
- Pay special attention to: loading states, error states, empty states, success confirmations
- If testing a flow (e.g., email → rule → draft), wait for async operations to complete before checking results
- Always `agent-browser close` when done to clean up

#### Browser authentication

The app requires OAuth login. agent-browser can't complete OAuth in headless mode, so you need the user's real browser session. Options (in order of preference):

1. **Connect to user's Chrome via CDP**: Ask the user to launch Chrome with `--remote-debugging-port=9222` (or check if it's already running). Then use `agent-browser --cdp 9222`. This reuses their existing logged-in session.
2. **Headed mode with profile**: Use `agent-browser --headed --profile <path>` to open a visible Chrome window. The user signs in once and the profile persists for future runs.
3. **State file**: After signing in, save with `agent-browser state save ./auth.json` and reload later with `agent-browser --state ./auth.json`. Note: state files can expire.

If the session hangs or API calls fail in the browser, the auth is likely stale — have the user sign in again.

### API testing
- If testing an API, get an API key from the UI first (Settings → API Keys) and screenshot the process
- Make real API calls and verify responses
- Check both success and error cases

### Eval testing
- If the right approach is an eval test, check `__tests__/eval/` for existing tests that cover similar ground
- Follow the eval test template in `.claude/skills/testing/eval.md`
- Use `describeEvalMatrix` for cross-model comparison when relevant
- Use `judgeMultiple` with appropriate `CRITERIA` for subjective outputs
- Run with `pnpm test-ai eval/<test-name>`

### Hybrid approaches
Often the best test combines approaches. For example:
- Use `gws` to create a Google Drive folder with a test PDF
- Use the browser to configure the feature to use that folder
- Trigger the feature (send an email, start a chat, etc.)
- Verify the result in both the UI (screenshot) and via API/database

## Step 4: Report results

**An error means the test failed.** Do not report success if any step produced an error, even if the error seems like a configuration issue. Either fix the configuration and retry, or report the failure clearly.

Give a clear pass/fail summary:
- What was tested
- What worked
- What failed — with screenshots and the actual error
- What you did to try to fix it

Always include screenshots — even for passing tests. The user wants to see what the UI looks like.

## Step 5: Persist (if appropriate)

After testing, ask the user if this should become a reusable test. Two options:

1. **Browser QA flow** — if the test is primarily UI-driven and would catch regressions, create a flow spec in `qa/browser-flows/` following the template. This can then be re-run with `/qa-run`.

2. **Eval test** — if the test is about AI output quality, write a proper eval test in `__tests__/eval/` that can be run with `pnpm test-ai`.

Don't persist trivial one-off checks (like "does this page load"). Persist tests that verify important behavior someone might break later.

## Tool reference

### gws CLI (Google Workspace)
```bash
# Create a Drive folder
gws drive files create --json '{"name": "Test Folder", "mimeType": "application/vnd.google-apps.folder"}'

# Upload a file to a folder
gws drive files create --json '{"name": "test.pdf", "parents": ["FOLDER_ID"]}' --upload ./test.pdf

# List Drive files
gws drive files list --params '{"q": "name contains '\''test'\''", "pageSize": 10}'

# Send a Gmail message
gws gmail users messages send --params '{"userId": "me"}' --json '{"raw": "BASE64_ENCODED_MESSAGE"}'

# Create a calendar event
gws calendar events insert --params '{"calendarId": "primary"}' --json '{"summary": "Test Event", "start": {"dateTime": "..."}, "end": {"dateTime": "..."}}'
```

### Eval test utilities
- `describeEvalMatrix(name, fn)` — run across models
- `createEvalReporter()` — track pass/fail
- `judgeMultiple({ input, output, criteria })` — LLM-as-judge
- `CRITERIA.*` — ACCURACY, COMPLETENESS, TONE, CONCISENESS, NO_HALLUCINATION, CORRECT_FORMAT

### Existing QA infrastructure
- Flow specs: `qa/browser-flows/*.md`
- Flow runner: `/qa-run`
- Flow creator: `/qa-new-flow`
- E2E tests: `__tests__/e2e/flows/`
- Eval tests: `__tests__/eval/`
