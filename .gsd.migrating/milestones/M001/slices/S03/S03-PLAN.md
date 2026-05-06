# S03: Classification Engine

**Goal:** Three-tier classification engine: rules (free) → Haiku → Sonnet, verified with organic production data
**Demo:** Emails classified correctly in production; cost within budget; rules seeded and working

## Must-Haves

- Complete the planned slice outcomes.

## Verification

- Run the task and slice verification checks for this slice.

## Tasks

- [x] **T01: Classification engine implementation** `est:3d`
  Build three-tier classification, seed rules, wire Gmail webhook → rule evaluation → label/archive, verify with organic data
  - Files: `apps/web/utils/ai/choose-rule.ts`, `apps/web/prisma/schema.prisma`
  - Verify: Emails classified correctly in production with organic data verification

## Files Likely Touched

- apps/web/utils/ai/choose-rule.ts
- apps/web/prisma/schema.prisma
