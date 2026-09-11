---
name: code-simplifier
description: Simplify and refine recently modified code for clarity, consistency, and maintainability while preserving exact behavior. Use when asked to simplify, polish, refactor lightly, or clean up current-session changes before review or PR.
---

# Code Simplifier

Refine recently modified code without changing what it does. Prioritize readable, explicit code over overly compact solutions.

Reference @AGENTS.md and any more specific local instructions for project conventions.

## Scope

Focus on code touched in the current session or current branch diff unless the user explicitly asks for a broader pass.

Do not introduce broad refactors, formatting churn, dependency changes, or unrelated edits.

## Rules

1. Preserve functionality exactly.
   - Keep features, outputs, side effects, data contracts, permissions, and error behavior intact.
   - Change how code is expressed, not what it does.

2. Apply project standards.
   - Use TypeScript with strict null checks.
   - Keep imports at the top of files.
   - Import directly from original sources; do not add barrel files or re-export patterns.
   - Prefer existing local patterns, frameworks, and helper APIs.
   - Infer types from Zod schemas with `z.infer<typeof schema>` instead of duplicating types.
   - Keep helper functions at the bottom of files.
   - Add comments only for why, not what.
   - Follow repository React, API route, server action, logging, and testing conventions when touching those areas.

3. Enhance clarity.
   - Reduce unnecessary complexity and nesting.
   - Remove redundant code and weak abstractions.
   - Improve names when intent becomes clearer.
   - Consolidate related logic only when it improves maintainability.
   - Avoid nested ternaries; prefer straightforward control flow, a small helper, a switch, or a lookup table.

4. Maintain balance.
   - Do not prioritize fewer lines over readability.
   - Do not create clever dense one-liners.
   - Do not combine too many concerns into one function or component.
   - Do not remove helpful abstractions that make the code easier to understand or extend.

## Workflow

1. Inspect the current diff and identify recently modified sections.
2. Look for low-risk simplifications that improve clarity or consistency.
3. Apply only changes that preserve behavior.
4. Run focused validation when practical for the files touched.
5. Report significant changes and validation performed.
