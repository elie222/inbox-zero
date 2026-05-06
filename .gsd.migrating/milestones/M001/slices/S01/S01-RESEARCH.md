# Phase 1: Ops Fixes - Research

**Researched:** 2026-04-27
**Domain:** Docker CI/CD, GitHub Actions multi-platform builds, server env var management (AWS SSM), Next.js/Better Auth signup policy
**Confidence:** HIGH — all findings verified directly from source files in the repository

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** RESEND_FROM_EMAIL default already committed in `apps/web/env.ts`. Task is verifying the env var is set in AWS Parameter Store and that digest actually sends from inbox-digest@tdfurn.com.
- **D-02:** Lock by domain — `AUTH_ALLOWED_EMAIL_DOMAINS=trueocean.com`. Mechanism exists in `apps/web/utils/auth-signup-policy.ts` — only env var needed on server.
- **D-03:** Upgrade existing `docker-build.yml` to multi-platform (linux/arm64 + linux/amd64) using QEMU-based buildx (no Depot), tagged with `latest` + short SHA. Trigger: push to main only.
- **D-04:** Deployment step is manual — CI builds and pushes only. Server update is `docker compose pull && docker compose up -d` over SSH when ready.
- **D-05:** Update `docker-compose.yml` to reference `ghcr.io/rebekah-create/inbox-zero-rebekah:latest` instead of `ghcr.io/elie222/inbox-zero:latest` for `web` and `worker` services.
- **D-06:** Phase 1 plans must verify all 4 OPS requirements end-to-end.

### Claude's Discretion

- Order of plan execution (suggested: OPS-04 first, then CI/CD upgrade, then server env verification last since it requires SSH)
- Exact format of SHA tag (short SHA from `github.sha`)
- Whether to add `workflow_dispatch` trigger (user said push-to-main only — leave out)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OPS-01 | Daily digest sends from inbox-digest@tdfurn.com (currently fails — wrong from domain) | env.ts default already set; need AWS SSM entry + live test |
| OPS-02 | Signups locked to rebekah@trueocean.com only | auth-signup-policy.ts reads AUTH_ALLOWED_EMAIL_DOMAINS; need AWS SSM entry + test |
| OPS-03 | GitHub Actions builds + pushes Docker image to ghcr.io/rebekah-create/inbox-zero-rebekah on push to main | docker-build.yml exists but is arm64-only and single-tag; needs multi-platform + SHA tag upgrade |
| OPS-04 | Server docker-compose.yml uses fork image not upstream elie222 image | docker-compose.yml currently references ghcr.io/elie222/inbox-zero:latest for web + worker |
</phase_requirements>

---

## Summary

Phase 1 is entirely an ops verification and configuration phase — no new features, no schema changes, no new dependencies. Three of the four OPS requirements are purely configuration: the code supporting them is already in the repo (signup policy, from-email default). The fourth (OPS-03) requires editing one GitHub Actions workflow file to add multi-platform support and SHA tagging.

The most concrete risk is ordering: `docker-compose.yml` should be updated and committed before the CI workflow is changed, so when CI runs after the workflow commit it will immediately produce an image that docker-compose already knows how to reference. Server-side env var verification (OPS-01, OPS-02) requires SSH access and AWS SSM writes — these cannot be automated and must be manual steps in the plan.

The systemd service runs `docker compose up -d` from `/opt/inbox-zero` on boot, which means the `docker-compose.yml` on the server must also be updated (via `scp` or `git pull`) for OPS-04 to be complete server-side.

**Primary recommendation:** Execute in this order — OPS-04 (docker-compose code change) → OPS-03 (CI upgrade, push to main to trigger) → OPS-02 (SSM env var + verify block) → OPS-01 (SSM env var + live digest test).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Digest from-address | API / Backend | — | RESEND_FROM_EMAIL is read by the web container at runtime; configured via env var |
| Signup lockdown | API / Backend | — | auth-signup-policy.ts runs server-side in Next.js API routes; env var gates access |
| Docker image build | CI/CD (GitHub Actions) | — | Build and push happen entirely in CI; no runtime impact |
| Image reference in compose | Deployment config | Server filesystem | docker-compose.yml is both in git and deployed to /opt/inbox-zero on server |

---

## Standard Stack

### Core (all already in place — no new installs)

| Component | Version / Source | Purpose | Notes |
|-----------|-----------------|---------|-------|
| `docker/build-push-action` | v6 (current in workflow) | Builds and pushes Docker image | [VERIFIED: workflow file] |
| `docker/setup-buildx-action` | v3 (current in workflow) | Enables BuildKit / multi-platform | [VERIFIED: workflow file] |
| `docker/setup-qemu-action` | v3 (standard pair with buildx) | Cross-compilation for amd64 on x86 runner | [VERIFIED: GitHub Actions docs pattern] |
| `docker/metadata-action` | v5 (standard) | Generates consistent tags (latest + SHA) | [ASSUMED — standard ecosystem pattern; not yet in workflow] |
| AWS SSM Parameter Store | — | Secret storage under `/inbox-zero/` | [VERIFIED: deploy/load-secrets.sh] |
| Better Auth | — | Auth framework; reads AUTH_ALLOWED_EMAIL_DOMAINS | [VERIFIED: apps/web/utils/auth-signup-policy.ts] |

### No new dependencies required for this phase.

**Installation:** None needed — all tools are either already in the workflow or built-in to GitHub Actions.

---

## Architecture Patterns

### System Architecture Diagram

```
[push to main]
      |
      v
GitHub Actions (ubuntu-latest + QEMU)
  setup-qemu  → enables arm64 cross-compilation on x86
  setup-buildx
  metadata-action → generates tags: latest, <short-sha>
  build-push-action
      |
      v
ghcr.io/rebekah-create/inbox-zero-rebekah
  :latest
  :<short-sha>
      |
      v (manual: ssh + docker compose pull)
EC2 /opt/inbox-zero/docker-compose.yml
  web service  → image: ghcr.io/rebekah-create/inbox-zero-rebekah:latest
  worker service → image: ghcr.io/rebekah-create/inbox-zero-rebekah:latest
      |
      v
Server boot: systemd → load-secrets.sh → docker compose up -d
  /opt/inbox-zero/.env contains:
    RESEND_FROM_EMAIL=Inbox Zero <inbox-digest@tdfurn.com>
    AUTH_ALLOWED_EMAIL_DOMAINS=trueocean.com
```

### Recommended Pattern: docker/metadata-action for Tags

The `docker/metadata-action` approach is the ecosystem standard for generating consistent Docker tags. It reads `github.sha` internally.

```yaml
# Source: GitHub Actions ecosystem standard (ASSUMED — not yet in workflow)
- name: Docker metadata
  id: meta
  uses: docker/metadata-action@v5
  with:
    images: ghcr.io/rebekah-create/inbox-zero-rebekah
    tags: |
      type=raw,value=latest
      type=sha,prefix=
```

This produces tags like `latest` and `abc1234` (7-char short SHA). The `prefix=` override removes the default `sha-` prefix to match the `abc1234` format specified in CONTEXT.md.

### Anti-Patterns to Avoid

- **Keeping `ubuntu-24.04-arm` runner for multi-platform:** Arm runners can emit arm64 natively but cannot cross-compile to amd64 without QEMU — and GitHub's hosted arm runners don't have QEMU available. Switch to `ubuntu-latest` (x86) + QEMU setup step. [VERIFIED: CONTEXT.md D-03 specifics section]
- **Hardcoding tags in `build-push-action`:** Bypasses metadata-action and makes SHA tags error-prone. Always pipe `${{ steps.meta.outputs.tags }}` through metadata-action.
- **Setting `AUTH_ALLOWED_EMAILS` instead of `AUTH_ALLOWED_EMAIL_DOMAINS`:** The code supports both, but `AUTH_ALLOWED_EMAILS` is an exact-match list. Using `AUTH_ALLOWED_EMAIL_DOMAINS=trueocean.com` is the correct decision (D-02) and allows any future @trueocean.com address without code changes. [VERIFIED: auth-signup-policy.ts lines 38-42]
- **Forgetting to update docker-compose.yml on the server:** The file in git and the file at `/opt/inbox-zero/docker-compose.yml` are separate. The systemd service runs from the server path. Both must reference the fork image for OPS-04 to be complete.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Multi-platform image tags | Custom shell scripts with `docker buildx imagetools` | `docker/metadata-action@v5` | Handles SHA extraction, prefix formatting, and tag list generation correctly across edge cases |
| Cross-platform builds | Native arm runner building both arches | `docker/setup-qemu-action@v3` + `ubuntu-latest` | QEMU handles amd64 emulation on x86; arm runners can't reliably cross-compile to amd64 |

---

## Exact Current State of Each File

### `docker-compose.yml` — lines 61 and 88

```yaml
# Current (WRONG — upstream image)
web:
  image: ghcr.io/elie222/inbox-zero:latest   # line 61

worker:
  image: ghcr.io/elie222/inbox-zero:latest   # line 88
```

Required change: replace both image values with `ghcr.io/rebekah-create/inbox-zero-rebekah:latest`.
[VERIFIED: docker-compose.yml lines 61, 88]

### `.github/workflows/docker-build.yml` — current state

```yaml
# Current (arm64-only, latest-tag-only, arm runner)
jobs:
  build-and-push:
    runs-on: ubuntu-24.04-arm        # ← must change to ubuntu-latest
    steps:
      - uses: docker/setup-buildx-action@v3   # ← keep
      # MISSING: docker/setup-qemu-action step
      # MISSING: docker/metadata-action step
      - uses: docker/build-push-action@v6
        with:
          platforms: linux/arm64               # ← must add linux/amd64
          tags: ghcr.io/rebekah-create/inbox-zero-rebekah:latest  # ← must add SHA tag
```

[VERIFIED: .github/workflows/docker-build.yml]

### `apps/web/env.ts` — RESEND_FROM_EMAIL (lines 205-208)

```typescript
// Current state — already correct, no code change needed
RESEND_FROM_EMAIL: z
  .string()
  .optional()
  .default("Inbox Zero <inbox-digest@tdfurn.com>"),
```

[VERIFIED: apps/web/env.ts lines 205-208]

### `apps/web/env.ts` — AUTH_ALLOWED_EMAIL_DOMAINS (lines 58-66)

```typescript
// Current state — schema exists, reads comma-separated string from env, no code change needed
AUTH_ALLOWED_EMAIL_DOMAINS: z
  .string()
  .optional()
  .transform((value) =>
    value?.split(",").map((entry) => entry.trim()).filter(Boolean),
  ),
```

[VERIFIED: apps/web/env.ts lines 58-66]

### `apps/web/utils/auth-signup-policy.ts`

No code changes needed. Function `isAllowedAuthSignupEmail` correctly:
1. Returns `true` (open) when both `allowedEmails` and `allowedDomains` are empty — meaning if no env var is set, anyone can sign up.
2. Checks domain match via `allowedDomains.includes(emailDomain)`.
[VERIFIED: auth-signup-policy.ts lines 38-42]

### `deploy/load-secrets.sh`

No code change needed. Loads ALL parameters under `/inbox-zero/` path automatically. New SSM parameters (`RESEND_FROM_EMAIL`, `AUTH_ALLOWED_EMAIL_DOMAINS`) will be picked up without script changes.
[VERIFIED: deploy/load-secrets.sh]

---

## Precise Changes Required Per OPS Requirement

### OPS-04: Fork image in docker-compose.yml (code change, git commit)

**File:** `docker-compose.yml`
**Change:** Two lines — update `image:` for `web` and `worker` services.

```yaml
# web service (line 61)
image: ghcr.io/rebekah-create/inbox-zero-rebekah:latest

# worker service (line 88)
image: ghcr.io/rebekah-create/inbox-zero-rebekah:latest
```

**Server action also required:** After committing, the server's copy at `/opt/inbox-zero/docker-compose.yml` must also be updated — either `git pull` if the server has the repo checked out, or `scp docker-compose.yml ubuntu@<ip>:/opt/inbox-zero/docker-compose.yml`.

### OPS-03: CI/CD multi-platform upgrade (code change, git commit triggers CI)

**File:** `.github/workflows/docker-build.yml`
**Changes:**
1. Change `runs-on: ubuntu-24.04-arm` → `runs-on: ubuntu-latest`
2. Add `docker/setup-qemu-action@v3` step before `setup-buildx`
3. Add `docker/metadata-action@v5` step after login
4. Update `build-push-action` to use `${{ steps.meta.outputs.tags }}` and add `linux/amd64` to platforms

Full target workflow:
```yaml
name: Build and Push Docker Image

on:
  push:
    branches:
      - main

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Set up QEMU
        uses: docker/setup-qemu-action@v3

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Docker metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/rebekah-create/inbox-zero-rebekah
          tags: |
            type=raw,value=latest
            type=sha,prefix=

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          file: docker/Dockerfile.prod
          push: true
          platforms: linux/arm64,linux/amd64
          tags: ${{ steps.meta.outputs.tags }}
          build-args: |
            NEXT_PUBLIC_BASE_URL=https://inbox.tdfurn.com
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

**Note:** Committing this file to main will immediately trigger the new CI workflow. The first run will be the verification for OPS-03.

### OPS-02: Signup lockdown (AWS SSM + server restart)

**No code change.** Server-side only.

```bash
# Add parameter to AWS SSM
aws ssm put-parameter \
  --name "/inbox-zero/AUTH_ALLOWED_EMAIL_DOMAINS" \
  --value "trueocean.com" \
  --type "SecureString" \
  --region us-east-1

# Reload secrets on server
ssh ubuntu@inbox.tdfurn.com "
  sudo systemctl stop inbox-zero.service &&
  sudo systemctl start inbox-zero.service
"
# OR manually reload secrets and restart containers:
ssh ubuntu@inbox.tdfurn.com "
  cd /opt/inbox-zero &&
  bash /opt/inbox-zero/load-secrets.sh &&
  docker compose up -d
"
```

### OPS-01: Digest from-address (AWS SSM + verification)

**No code change.** The default in env.ts is already correct. Server-side verification only.

```bash
# Check if parameter exists
aws ssm get-parameter \
  --name "/inbox-zero/RESEND_FROM_EMAIL" \
  --region us-east-1

# If missing or wrong, set it:
aws ssm put-parameter \
  --name "/inbox-zero/RESEND_FROM_EMAIL" \
  --value "Inbox Zero <inbox-digest@tdfurn.com>" \
  --type "SecureString" \
  --region us-east-1 \
  --overwrite

# Reload secrets and restart
ssh ubuntu@inbox.tdfurn.com "
  bash /opt/inbox-zero/load-secrets.sh &&
  docker compose up -d
"

# Trigger a test digest
ssh ubuntu@inbox.tdfurn.com "
  source /opt/inbox-zero/.env &&
  curl -s -X GET 'http://localhost:3000/api/resend/digest/all' \
    -H \"Authorization: Bearer \$CRON_SECRET\"
"
```

---

## Verification Steps Per Requirement

### OPS-01 Verification
1. SSH to server, check `.env`: `grep RESEND_FROM_EMAIL /opt/inbox-zero/.env` — must show `inbox-digest@tdfurn.com`
2. Trigger digest endpoint and wait for email delivery to rebekah@trueocean.com
3. Inspect received email headers — `From:` field must be `inbox-digest@tdfurn.com`

### OPS-02 Verification
1. SSH to server, check `.env`: `grep AUTH_ALLOWED_EMAIL_DOMAINS /opt/inbox-zero/.env` — must show `trueocean.com`
2. Attempt to sign up with a non-trueocean.com email (e.g., gmail.com) — must be blocked with signup_not_allowed error
3. Confirm rebekah@trueocean.com can still sign in normally

### OPS-03 Verification
1. Push commit to main → observe GitHub Actions run
2. Workflow must complete successfully with `ubuntu-latest` runner
3. Check GHCR package page: `ghcr.io/rebekah-create/inbox-zero-rebekah` must show both `latest` and `<short-sha>` tags
4. Confirm both `linux/amd64` and `linux/arm64` manifests exist: `docker buildx imagetools inspect ghcr.io/rebekah-create/inbox-zero-rebekah:latest`

### OPS-04 Verification
1. In git: `grep image docker-compose.yml` — both web and worker must show `ghcr.io/rebekah-create/inbox-zero-rebekah:latest`
2. On server: `grep image /opt/inbox-zero/docker-compose.yml` — same check
3. Running container: `docker inspect inbox-zero-web-1 | jq '.[0].Config.Image'` — must show fork image not elie222 image

---

## Common Pitfalls

### Pitfall 1: Server docker-compose.yml not updated separately

**What goes wrong:** `docker-compose.yml` is updated in git and the server runs `docker compose pull`, but the server's copy of docker-compose.yml still points to the upstream image, so it pulls the wrong image.
**Why it happens:** The systemd service runs from `/opt/inbox-zero/docker-compose.yml`, which is a separate file from the git repo. The server doesn't auto-pull the compose file.
**How to avoid:** Explicitly `scp` or copy the compose file to the server as part of the OPS-04 deployment step.
**Warning signs:** `docker compose pull` succeeds but `docker ps` shows the elie222 image hash.

### Pitfall 2: Forgetting to reload secrets after SSM changes

**What goes wrong:** SSM parameter is added but the running `.env` file isn't updated, so the container still has the old (or missing) value.
**Why it happens:** `load-secrets.sh` only runs at systemd start. Adding a parameter to SSM doesn't automatically update the running environment.
**How to avoid:** Always run `load-secrets.sh` then `docker compose up -d` after any SSM change.
**Warning signs:** `grep RESEND_FROM_EMAIL /opt/inbox-zero/.env` shows old or missing value after SSM update.

### Pitfall 3: RESEND_FROM_EMAIL format

**What goes wrong:** Setting the env var to just `inbox-digest@tdfurn.com` instead of `Inbox Zero <inbox-digest@tdfurn.com>` — Resend accepts both but the display name "Inbox Zero" is lost.
**Why it happens:** The default in env.ts includes the display name format; a bare address is technically valid.
**How to avoid:** Use the full `Name <email>` format consistent with the env.ts default.

### Pitfall 4: Multi-platform build cache miss on first run

**What goes wrong:** First run with QEMU + multi-platform takes significantly longer (10-20+ minutes) because GHA cache is cold for the new platform combination.
**Why it happens:** Cache key changes when platforms change. This is expected, not a failure.
**How to avoid:** Know this is normal; don't cancel the first run. Subsequent runs will be faster.

### Pitfall 5: open signup if both env vars are unset

**What goes wrong:** If `AUTH_ALLOWED_EMAILS` and `AUTH_ALLOWED_EMAIL_DOMAINS` are both missing from `.env`, `isAllowedAuthSignupEmail` returns `true` for all emails (line 38 of auth-signup-policy.ts).
**Why it happens:** The function treats "no restrictions configured" as "open access."
**How to avoid:** Verify SSM parameter is set AND that `.env` file contains the value after `load-secrets.sh` runs. This is exactly why end-to-end verification (D-06) is required.

---

## Runtime State Inventory

This is not a rename/refactor phase, but there is meaningful runtime state to account for for OPS-02 and OPS-01.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None relevant | — |
| Live service config | `/opt/inbox-zero/.env` on EC2 — loaded from SSM at boot; currently missing RESEND_FROM_EMAIL and AUTH_ALLOWED_EMAIL_DOMAINS if not yet set | Add SSM parameters, reload .env, restart containers |
| OS-registered state | systemd `inbox-zero.service` — already registered, no change needed | None |
| Secrets/env vars | `/inbox-zero/RESEND_FROM_EMAIL` and `/inbox-zero/AUTH_ALLOWED_EMAIL_DOMAINS` in AWS SSM — likely absent (never been set) | `aws ssm put-parameter` for each |
| Build artifacts | Server running `ghcr.io/elie222/inbox-zero:latest` until `docker compose pull` is run after OPS-04 | `docker compose pull && docker compose up -d` after updating compose file |

**Important:** The server's running container image is the upstream elie222 image until OPS-04 is explicitly deployed by pulling and restarting.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| GitHub Actions (ubuntu-latest) | OPS-03 | ✓ | GitHub-hosted | — |
| GHCR (ghcr.io) | OPS-03 | ✓ | — | — |
| GITHUB_TOKEN (automatic) | OPS-03 registry push | ✓ | automatic in Actions | — |
| AWS SSM (us-east-1) | OPS-01, OPS-02 | ✓ (assumed) | — | — |
| SSH access to EC2 | OPS-01, OPS-02, OPS-04 server update | requires key (`inbox-key`) | — | Manual AWS console |
| AWS CLI (local) | OPS-01, OPS-02 SSM writes | [ASSUMED available] | — | AWS console UI |
| Resend API (OPS-01 live test) | OPS-01 end-to-end verification | ✓ (RESEND_API_KEY in SSM) | — | — |

**Missing dependencies with no fallback:** None identified.

**Missing dependencies with fallback:** SSH key `inbox-key` must be available locally to run server commands — fallback is AWS Systems Manager Session Manager (no key needed) or EC2 Instance Connect.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (from CLAUDE.md `pnpm test`) |
| Config file | `apps/web/vitest.config.ts` (standard location) |
| Quick run command | `pnpm test` (from repo root) |
| Full suite command | `pnpm test` (non-AI tests only) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | Notes |
|--------|----------|-----------|-------------------|-------|
| OPS-01 | Digest sends from inbox-digest@tdfurn.com | manual smoke | — | Requires live Resend API + active account |
| OPS-02 | Non-trueocean.com signup blocked | unit (auth policy) | `pnpm test -- auth-signup-policy` | Logic tested in auth-signup-policy.ts unit tests (if they exist) |
| OPS-02 | rebekah@trueocean.com can sign in | manual smoke | — | Requires live server |
| OPS-03 | CI workflow runs and produces multi-platform image | CI run observation | trigger via git push | No local test possible — CI is the test |
| OPS-04 | docker-compose.yml references fork image | grep/code review | `grep -n "elie222" docker-compose.yml` returns 0 matches | Fast local check |

### Wave 0 Gaps

Check for existing auth-signup-policy tests:
```bash
find apps/web -name "*.test.ts" | xargs grep -l "auth-signup-policy" 2>/dev/null
```

If no test file exists for `auth-signup-policy.ts`, a unit test covering the domain-block behavior is a Wave 0 gap for OPS-02.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Better Auth; domain allowlist via AUTH_ALLOWED_EMAIL_DOMAINS |
| V3 Session Management | no | Unchanged from existing implementation |
| V4 Access Control | yes | Single-tenant lock — only trueocean.com domain allowed |
| V5 Input Validation | yes | Zod schema in env.ts validates all env vars at startup |
| V6 Cryptography | no | No crypto changes in this phase |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unauthorized account creation | Spoofing | AUTH_ALLOWED_EMAIL_DOMAINS env var — blocks non-trueocean.com signups |
| Open signup (env var missing) | Elevation of privilege | auth-signup-policy.ts line 38: returns true when both lists empty — MUST verify env var is set and loaded |
| CRON endpoint abuse | Tampering | Bearer CRON_SECRET required on all /api/cron/* routes (CLAUDE.md) |

**Critical:** If `AUTH_ALLOWED_EMAIL_DOMAINS` is not set in `.env`, the signup policy allows anyone to create an account. This is the exact gap OPS-02 closes. End-to-end verification is mandatory.

---

## Code Examples

### Full target docker-build.yml

```yaml
# Source: verified against current file + ecosystem standard for multi-platform builds
name: Build and Push Docker Image

on:
  push:
    branches:
      - main

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Set up QEMU
        uses: docker/setup-qemu-action@v3

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Docker metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/rebekah-create/inbox-zero-rebekah
          tags: |
            type=raw,value=latest
            type=sha,prefix=

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          file: docker/Dockerfile.prod
          push: true
          platforms: linux/arm64,linux/amd64
          tags: ${{ steps.meta.outputs.tags }}
          build-args: |
            NEXT_PUBLIC_BASE_URL=https://inbox.tdfurn.com
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

### docker-compose.yml image lines (target state)

```yaml
# web service
  web:
    image: ghcr.io/rebekah-create/inbox-zero-rebekah:latest

# worker service
  worker:
    image: ghcr.io/rebekah-create/inbox-zero-rebekah:latest
```

### SSM parameter writes

```bash
# OPS-01
aws ssm put-parameter \
  --name "/inbox-zero/RESEND_FROM_EMAIL" \
  --value "Inbox Zero <inbox-digest@tdfurn.com>" \
  --type "SecureString" \
  --region us-east-1 \
  --overwrite

# OPS-02
aws ssm put-parameter \
  --name "/inbox-zero/AUTH_ALLOWED_EMAIL_DOMAINS" \
  --value "trueocean.com" \
  --type "SecureString" \
  --region us-east-1
```

### Server restart sequence after SSM changes

```bash
ssh ubuntu@inbox.tdfurn.com
cd /opt/inbox-zero
bash /opt/inbox-zero/load-secrets.sh
grep RESEND_FROM_EMAIL .env      # verify
grep AUTH_ALLOWED_EMAIL_DOMAINS .env  # verify
docker compose up -d
```

### Verify running image is fork (not upstream)

```bash
ssh ubuntu@inbox.tdfurn.com "docker inspect \$(docker compose -f /opt/inbox-zero/docker-compose.yml ps -q web) | jq -r '.[0].Config.Image'"
# Expected: ghcr.io/rebekah-create/inbox-zero-rebekah:latest
# Wrong:    ghcr.io/elie222/inbox-zero:latest
```

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `docker/metadata-action@v5` `type=sha,prefix=` produces 7-char short SHA without `sha-` prefix | CI workflow pattern | Tag format may differ — verify actual output on first CI run |
| A2 | AWS CLI is available locally to run `aws ssm put-parameter` | Environment Availability | Would need to use AWS console UI instead — slower but viable |
| A3 | RESEND_FROM_EMAIL is not currently set in SSM (env.ts default is relied upon) | OPS-01 runtime state | If it IS set to wrong value in SSM, it overrides the default — must check SSM not just env.ts |
| A4 | Server currently has `/opt/inbox-zero/docker-compose.yml` matching the repo version (except image lines) | OPS-04 server state | If diverged, full file copy is safer than targeted line edit |

---

## Open Questions (RESOLVED)

1. **Is RESEND_FROM_EMAIL already set in SSM (possibly to a wrong value)?**
   - What we know: env.ts default is correct; SSM would override it
   - What's unclear: whether a prior session added an incorrect value to SSM
   - Recommendation: First task in OPS-01 plan should be `aws ssm get-parameter --name /inbox-zero/RESEND_FROM_EMAIL` to check
   - *RESOLVED: Handled by PLAN-03 Task 1 Step 3 SSM audit — executor checks current value and takes CASE A/B/C action accordingly.*

2. **Is the server's docker-compose.yml already a modified version?**
   - What we know: the repo file uses the elie222 image; the server file may be a different copy
   - What's unclear: whether the server file has other local modifications that would be lost by a full `scp`
   - Recommendation: `ssh` to server and `diff /opt/inbox-zero/docker-compose.yml` against repo version before overwriting
   - *RESOLVED: Handled by PLAN-01 Task 2 Option A (git pull on server) or Option B (scp) — both check server state before overwriting.*

3. **Does AUTH_ALLOWED_EMAILS currently exist in SSM (locking to exact email rather than domain)?**
   - What we know: CLAUDE.md mentions AUTH_ALLOWED_EMAILS in the fork context note (not AUTH_ALLOWED_EMAIL_DOMAINS)
   - What's unclear: whether an old `AUTH_ALLOWED_EMAILS=rebekah@trueocean.com` is already in SSM
   - Recommendation: `aws ssm get-parameters-by-path --path /inbox-zero/` to list all current parameters before making changes
   - *RESOLVED: Handled by PLAN-03 Task 1 Step 1 SSM audit — executor lists all /inbox-zero/ parameters and handles old AUTH_ALLOWED_EMAILS presence (leave or delete) before setting AUTH_ALLOWED_EMAIL_DOMAINS.*

---

## Sources

### Primary (HIGH confidence — directly verified from repository files)
- `docker-compose.yml` — lines 61, 88 (current upstream image references)
- `.github/workflows/docker-build.yml` — full file (current arm64-only state)
- `apps/web/utils/auth-signup-policy.ts` — full file (domain allowlist logic)
- `apps/web/env.ts` — lines 49-66, 205-208 (AUTH_ALLOWED_EMAIL_DOMAINS, RESEND_FROM_EMAIL schemas)
- `deploy/load-secrets.sh` — full file (SSM loading mechanism)
- `deploy/rebuild.md` — full file (server setup procedure)
- `deploy/inbox-zero.service` — full file (systemd ExecStart)
- `CLAUDE.md` — full file (fork context, deployment procedure)
- `.planning/phases/01-ops-fixes/01-CONTEXT.md` — full file (locked decisions)

### Secondary (MEDIUM confidence)
- GitHub Actions ecosystem pattern for `docker/metadata-action` `type=sha,prefix=` tag format — standard usage, not verified by running the workflow

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- File state (what needs changing): HIGH — read directly from source files
- Architecture patterns (CI workflow shape): HIGH — verified against current file + ecosystem standard
- Server-side state (SSM contents, running image): MEDIUM — cannot verify without SSH; assumptions logged
- Pitfalls: HIGH — derived directly from code logic in auth-signup-policy.ts

**Research date:** 2026-04-27
**Valid until:** 2026-05-27 (stable infra — unlikely to change)