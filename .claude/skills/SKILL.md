---
name: debug
description: Runtime debugging workflow with automated log collection. Use when fixing bugs that require runtime evidence (values, types, flow), when you'd otherwise ask user to "open DevTools, reproduce X, tell me what you see", or when bug depends on user interaction that can't be simulated. This skill automates log collection - logs are captured server-side and accessible programmatically.
---

# Debug Mode

Fix bugs with **runtime evidence**, not guesses.

```
Don't guess → Hypothesize → Instrument → Reproduce → Analyze → Fix → Verify
```

## When to Use

**Trigger signals** (if you're about to do any of these, use this skill instead):
- "Open DevTools Console and check for..."
- "Reproduce the bug and tell me what you see"
- "Add console.log and let me know the output"
- "Click X, open Y, check if Z appears in console"

**Example scenario that should trigger this skill:**
```
❌ Without skill (manual, slow):
"I added debug logging. Please:
1. Open the app in browser
2. Open DevTools Console (F12)
3. Open the defect modal and select a defect
4. Check console for [DEBUG] logs
5. Tell me what you see"

✅ With skill (automated):
Logs are captured server-side → you read them directly → no user copy-paste needed
```

**Use when debugging:**
- State/value issues (null, undefined, wrong type)
- Conditional logic (which branch was taken)
- Async timing (race conditions, load order)
- User interaction flows (modals, forms, clicks)

## Arguments

```
/debug /path/to/project
```

If no path provided, use current working directory.

## Workflow

### Phase 1: Start Log Server

**Step 1: Ensure server is running** (starts if needed, no-op if already running):

```bash
node skills/debug/scripts/debug_server.js /path/to/project &
```

Server outputs JSON:
- `{"status":"started",...}` - new server started
- `{"status":"already_running",...}` - server was already running (this is fine!)

**Step 2: Create session** (server generates unique ID from your description):

```bash
curl -s -X POST http://localhost:8787/session -d '{"name":"fix-null-userid"}'
```

Response:
```json
{"session_id":"fix-null-userid-a1b2c3","log_file":"/path/to/project/.debug/debug-fix-null-userid-a1b2c3.log"}
```

**Save the `session_id` from the response** - use it in all subsequent steps.

**Server endpoints:**
- POST `/session` with `{"name": "description"}` → creates session, returns `{session_id, log_file}`
- POST `/log` with `{"sessionId": "...", "msg": "..."}` → writes to log file
- GET `/` → returns status and log directory

**If port 8787 busy:** `lsof -ti :8787 | xargs kill -9` then restart

──────────

### Phase 2: Generate Hypotheses

**Before instrumenting**, generate 3-5 specific hypotheses:

```
Hypothesis H1: userId is null when passed to calculateScore()
  Expected: number (e.g., 5)
  Actual: null
  Test: Log userId at function entry

Hypothesis H2: score is string instead of number
  Expected: 85 (number)
  Actual: "85" (string)
  Test: Log typeof score
```

Each hypothesis must be:
- **Specific** (not "something is wrong")
- **Testable** (can confirm/reject with logs)
- **Cover different subsystems** (don't cluster)

──────────

### Phase 3: Instrument Code

Add logging calls to test all hypotheses.

**JavaScript/TypeScript:**
```javascript
// #region debug
const SESSION_ID = 'REPLACE_WITH_SESSION_ID'; // e.g. 'fix-null-userid-a1b2c3'
const DEBUG_LOG_URL = 'http://localhost:8787/log';

const debugLog = (msg, data = {}, hypothesisId = null) => {
  const payload = JSON.stringify({
    sessionId: SESSION_ID,
    msg,
    data,
    hypothesisId,
    loc: new Error().stack?.split('\n')[2],
  });

  if (navigator.sendBeacon?.(DEBUG_LOG_URL, payload)) return;
  fetch(DEBUG_LOG_URL, { method: 'POST', body: payload }).catch(() => {});
};
// #endregion

// Usage
debugLog('Function entry', { userId, score, typeScore: typeof score }, 'H1,H2');
```

**Python:**
```python
# #region debug
import requests, traceback
SESSION_ID = 'REPLACE_WITH_SESSION_ID'  # e.g. 'fix-null-userid-a1b2c3'
def debug_log(msg, data=None, hypothesis_id=None):
    try:
        requests.post('http://localhost:8787/log', json={
            'sessionId': SESSION_ID, 'msg': msg, 'data': data,
            'hypothesisId': hypothesis_id, 'loc': traceback.format_stack()[-2].strip()
        }, timeout=0.5)
    except: pass
# #endregion

# Usage
debug_log('Function entry', {'user_id': user_id, 'type': type(user_id)}, 'H1')
```

**Guidelines:**
- 3-8 instrumentation points
- Cover: entry/exit, before/after critical ops, branch paths
- Tag each log with `hypothesisId`
- Wrap in `// #region debug` ... `// #endregion`
- **High-frequency events** (mousemove, scroll): log only on **state change**
- Log both **intent** and **result**

──────────

### Phase 4: Clear and Reproduce

1. Clear logs:
   ```bash
   : > /path/to/project/.debug/debug-$SESSION_ID.log
   ```

2. Provide reproduction steps:
   ```xml
   <reproduction_steps>
   1. Start app: yarn dev
   2. Navigate to /users
   3. Click "Calculate Score"
   4. Observe NaN displayed
   </reproduction_steps>
   ```

3. User reproduces bug

──────────

### Phase 5: Analyze Logs

Read and evaluate:
```bash
cat /path/to/project/.debug/debug-$SESSION_ID.log
```

For each hypothesis:

```
Hypothesis H1: userId is null
  Status: CONFIRMED
  Evidence: {"msg":"Function entry","data":{"userId":null}}

Hypothesis H2: score is string
  Status: REJECTED
  Evidence: {"data":{"typeScore":"number"}}
```

**Status options:**
- **CONFIRMED**: Logs prove it
- **REJECTED**: Logs disprove it
- **INCONCLUSIVE**: Need more instrumentation

**If all INCONCLUSIVE/REJECTED**: Generate new hypotheses, add more logs, iterate.

──────────

### Phase 6: Fix

**Only fix when logs confirm root cause.**

Keep instrumentation active (don't remove yet).

Tag verification logs with `runId: "post-fix"`:
```javascript
debugLog('Function entry', { userId, runId: 'post-fix' }, 'H1');
```

──────────

### Phase 7: Verify

1. Clear logs
2. User reproduces (bug should be gone)
3. Compare before/after:
   ```
   Before: {"data":{"userId":null},"runId":"run1"}
   After:  {"data":{"userId":5},"runId":"post-fix"}
   ```
4. Confirm with log evidence

**If still broken**: New hypotheses, more logs, iterate.

──────────

### Phase 8: Five Whys (Optional)

**When to run:** Recurring bug, prod incident, security issue, or "this keeps happening".

After fixing, ask "Why did this bug exist?" to find systemic causes:

```
Bug: API returns NaN

Why 1: userId was null → Code fix: null check
Why 2: No input validation → Add validation
Why 3: No test for null case → Add test
Why 4: Review didn't catch → (one-off, acceptable)
```

**Categories:**
| Type | Action |
|------|--------|
| CODE | Fix immediately |
| TEST | Add test |
| PROCESS | Update checklist/review |
| SYSTEMIC | Document patterns |

**Skip if:** Simple one-off bug, low impact, not recurring.

──────────

### Phase 9: Clean Up

Remove instrumentation only after:
- Post-fix logs prove success
- User confirms resolved

Search for `#region debug` and remove all debug code.

## Log Format

Each line is NDJSON:
```json
{"ts":"2024-01-03T12:00:00.000Z","msg":"Button clicked","data":{"id":5},"hypothesisId":"H1","loc":"app.js:42"}
```

## Critical Rules

1. **NEVER fix without runtime evidence** - Always collect logs first
2. **NEVER remove instrumentation before verification** - Keep until fix confirmed
3. **NEVER guess** - If unsure, add more logs
4. **If all hypotheses rejected** - Generate new ones from different subsystems

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Server won't start | Check port 8787 not in use: `lsof -i :8787` |
| Logs empty | Check browser blocks (mixed content/CSP/CORS), firewall |
| Wrong log file | Verify session ID matches |
| Too many logs | Filter by hypothesisId, use state-change logging |
| Can't reproduce | Ask user for exact steps, check environment |

### CORS / Mixed Content Workarounds

If logs aren't arriving, it’s usually one of:
- **Mixed content**: HTTPS app → `http://localhost:8787` is blocked. Use a dev-server proxy (same origin) or serve the log endpoint over HTTPS.
- **CSP**: `connect-src` blocks the log URL. Use a dev-server proxy or update CSP.
- **CORS preflight**: `Content-Type: application/json` triggers `OPTIONS`. Use a “simple” request (`text/plain`) or `sendBeacon`.

**1. `sendBeacon` (avoids preflight; fire-and-forget)**:
```javascript
const DEBUG_LOG_URL = 'http://localhost:8787/log';
const debugLog = (msg, data = {}, hypothesisId = null) => {
  const payload = JSON.stringify({ sessionId: SESSION_ID, msg, data, hypothesisId });
  if (navigator.sendBeacon?.(DEBUG_LOG_URL, payload)) return;
  fetch(DEBUG_LOG_URL, { method: 'POST', body: payload }).catch(() => {});
};
```
Note: still blocked by mixed content + CSP.

**2. Dev server proxy (Vite example)** - same-origin `/__log` → `http://localhost:8787/log`:
```javascript
// vite.config.js
export default {
  server: {
    proxy: {
      '/__log': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/__log/, '/log'),
      },
    },
  },
};

// Then POST to /__log instead of localhost:8787/log
```

**3. Last resort (local only)** - allow insecure content / disable mixed-content blocking in browser settings

## Checklist

- [ ] Server running (started or already_running)
- [ ] Session created via `POST /session` - save the returned `session_id`
- [ ] 3-5 hypotheses generated
- [ ] 3-8 logs added, tagged with hypothesisId
- [ ] Logs cleared before reproduction
- [ ] Reproduction steps provided
- [ ] Each hypothesis evaluated (CONFIRMED/REJECTED/INCONCLUSIVE)
- [ ] Fix based on evidence only
- [ ] Before/after comparison done
- [ ] Instrumentation removed after confirmation
