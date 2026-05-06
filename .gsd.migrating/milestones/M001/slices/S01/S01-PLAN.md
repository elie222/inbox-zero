# S01: Ops Fixes

**Goal:** Fix broken digest sender, lock signups, establish CI/CD pipeline
**Demo:** Digest email sends successfully; signup locked to allowed domain; Docker image builds and deploys on push to main

## Must-Haves

- Complete the planned slice outcomes.

## Verification

- Run the task and slice verification checks for this slice.

## Tasks

- [x] **T01: Ops fixes implementation** `est:1d`
  Fix digest sender, lock signups to AUTH_ALLOWED_EMAIL_DOMAINS, establish Docker CI/CD on push to main
  - Files: `.github/workflows/docker-build.yml`, `apps/web/env.ts`
  - Verify: Docker image builds and deploys; digest sender working; signup locked

## Files Likely Touched

- .github/workflows/docker-build.yml
- apps/web/env.ts
