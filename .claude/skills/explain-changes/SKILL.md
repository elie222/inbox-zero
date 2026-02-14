---
description: Explain recent changes and provide a structured summary with security checks
---

Review the recent changes and provide:

1. **Summary**: What was built or changed? Explain in 2-3 sentences.

2. **Files changed**: List the files that were added or modified, grouped by area (e.g., API routes, components, database, utils).

3. **Security check**:
   - Any new API endpoints? Are they properly authenticated?
   - Any database writes? Is the input validated?
   - Any external API calls? Are secrets handled correctly?
   - Any user-facing inputs? Are they sanitized?

4. **Risk areas**: Which files or functions are most likely to cause problems? Why?

5. **Edge cases**: What scenarios might break this? What hasn't been tested?

6. **Missing pieces**: Based on what this feature is supposed to do, is anything obviously incomplete or not wired up?

7. **Questions for me**: Anything you're uncertain about or made assumptions on that I should verify?

Be concise. Flag problems, don't over-explain things that are fine.
