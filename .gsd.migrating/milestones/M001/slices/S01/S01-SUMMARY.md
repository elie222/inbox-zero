---
id: S01
parent: M001
milestone: M001
provides:
  - (none)
requires:
  []
affects:
  []
key_files:
  - (none)
key_decisions:
  - (none)
patterns_established:
  - (none)
observability_surfaces:
  - none
drill_down_paths:
  []
duration: ""
verification_result: passed
completed_at: 2026-05-06T17:05:26.615Z
blocker_discovered: false
---

# S01: Ops Fixes

**Ops baseline established: CI/CD green, signups locked, digest sender working in production.**

## What Happened

Fixed the broken digest sender that had been silently failing, locked signups to AUTH_ALLOWED_EMAIL_DOMAINS to enforce single-tenant access, and established the Docker CI/CD pipeline building linux/arm64+amd64 images on every push to main. All verified in production.

## Verification

Production verified: Docker image builds and deploys on push to main; signups locked; digest sender operational.

## Requirements Advanced

None.

## Requirements Validated

None.

## New Requirements Surfaced

None.

## Requirements Invalidated or Re-scoped

None.

## Operational Readiness

None.

## Deviations

None.

## Known Limitations

None.

## Follow-ups

None.

## Files Created/Modified

None.
