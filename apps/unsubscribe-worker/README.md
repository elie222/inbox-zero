# Browser unsubscribe worker

Opt-in browser automation for the existing unsubscribe action. The web app resolves a link from the authenticated account's mailbox and sends only that link, its recipient email and a random job ID. The coordinator creates a fresh sandbox, drives a bounded browser session and destroys the sandbox before returning a result.

Only an explicit page acknowledgment can produce `confirmed`. HTTP success alone is insufficient. Login, CAPTCHA, ambiguous scope and unsupported pages return `needs_user` or `failed`; the UI retains its manual unsubscribe fallback. A page acknowledgment still does not prove that future mail will stop.

There are no schema changes. Existing structured logs record the successful method, sender ID and completion time; subsequent blocked-email logs include sender ID and original received time. Join those events by account/sender, deduplicate message IDs and allow a delivery grace period. Log retention and incomplete message processing still limit longitudinal analysis; this is not a durable unsubscribe audit trail.

## Architecture and privacy boundary

- The coordinator is trusted and holds the service secret, provider credentials and model credentials. It runs separately from the web app. A compromised coordinator can access concurrent job data, so its host and dependencies remain part of the trusted computing base.
- Each job has its own OS sandbox, browser process/context, capability token, model history and network namespace/provider firewall. Sandboxes never receive mailbox OAuth tokens, database credentials, other jobs or model/provider API keys. No browser or sandbox is pooled between jobs.
- Browser traffic goes through a TLS CONNECT broker. It resolves and pins public IPv4 destinations, rejects private/reserved addresses and its own IP, and allows only destination port 443. Requests, tunnels, bytes, controls and model steps are bounded. TLS verification remains enabled. This deliberately excludes plaintext and IPv6-only sites.
- The runner can click observed controls, enter only the owning recipient email, select an observed option, or stop. The new model prompt treats pages as untrusted and limits actions to the requested unsubscribe. This is an AI judgment boundary, not a proof against deceptive same-page content. It cannot execute model-supplied scripts or access another job.
- Tokens are revoked on completion/cancellation. Work is bounded to 120 seconds plus at most 30 seconds of awaited cleanup; the web caller allows 170 seconds. Every sandbox also has an independent three-minute expiry. Unconfirmed cleanup stops new jobs until the service is restarted after operator investigation.
- The application stores no screenshots, browser profiles or page bodies. The configured model receives page text and controls, which may contain personal data or unsubscribe tokens. Sandbox providers can also process job data. Use providers and retention settings appropriate for your privacy requirements, or an independently hosted compatible model endpoint. Disable request-body, command-output and proxy credential logging in surrounding infrastructure.

## Configure the coordinator

Use Node 24 and run `pnpm install` from the repository root. Copy this app's `.env.example` to a protected environment file, filling required fields and removing unused optional entries.

Set `UNSUBSCRIBE_BROKER_URL` to the dedicated TLS hostname, and `UNSUBSCRIBE_BROKER_IP` to its fixed IPv4 address reachable from sandboxes. The broker address must expose **only the broker port** to sandbox traffic. Keep management services on another address/interface. Set the TLS certificate/key file paths and the corresponding listening port. Use a publicly trusted certificate for the runner; do not disable TLS verification.

Set `UNSUBSCRIBE_MODEL_ENDPOINT` to the full HTTPS chat-completions endpoint, with the model name and API key. The endpoint must accept JSON-object output, `max_tokens` and `temperature` and return `choices[0].message.content`. There is no implicit model provider or credential fallback.

Run the coordinator as a supervised service with its protected environment loaded:

```sh
cd apps/unsubscribe-worker
node --env-file=/etc/unsubscribe-worker.env src/index.ts
```

The coordinator serves `/jobs`, `/decision`, and authenticated CONNECT on the same TLS port. Many HTTP reverse proxies do not forward CONNECT; use direct TLS or a compatible TCP load balancer. Sessions are in memory: use a single coordinator instance initially. Multiple instances need a broker address pinned to the instance that owns the job. Do not load-balance requests randomly across instances. Concurrent capacity defaults to two; additional jobs fail promptly and the user can retry.

## Self-hosted Docker + gVisor

Use a dedicated Linux host with Docker, the `runsc` gVisor runtime, systemd and Linux 5.16+ with nftables netdev egress support. The coordinator needs permission to run Docker, schedule `systemd-run` expiry timers and stop those timers. Those are privileged host operations: do not expose the Docker socket to any browser container. `/usr/bin/docker` must exist for the independent timer.

Build these images from the repository root:

```sh
docker build -f apps/unsubscribe-worker/Dockerfile -t unsubscribe-runner .
docker build -f apps/unsubscribe-worker/Dockerfile.router -t unsubscribe-router apps/unsubscribe-worker
```

Set `UNSUBSCRIBE_SANDBOX_PROVIDER=docker`, `UNSUBSCRIBE_SANDBOX_IMAGE=unsubscribe-runner` and `UNSUBSCRIBE_ROUTER_IMAGE=unsubscribe-router`. Pre-pull/build images; runtime package installation is not allowed.

Every job starts a small trusted router container that installs deny-by-default IPv4/IPv6 and device egress rules. Device egress filtering is required because gVisor uses raw AF_PACKET networking that bypasses ordinary IP OUTPUT filtering. See the [gVisor networking architecture](https://gvisor.dev/docs/architecture_guide/networking/) and [netfilter device hooks](https://netfilter.org/projects/nftables/manpage.html). A separate unprivileged, read-only gVisor browser joins that job's network namespace with no network administration capability, host mounts or inherited credentials. Temporary browser data lives on bounded tmpfs. The host schedules deletion before any job data enters the sandbox. Missing systemd, firewall support or gVisor causes failure; there is no ordinary-container fallback. Standard Docker Desktop on macOS is not this deployment target.

## Daytona

Build the runner image above and use it to create a private Daytona snapshot with the required browser dependencies already installed. Configure `UNSUBSCRIBE_SANDBOX_PROVIDER=daytona`, the API key and snapshot name. The API URL override is optional; omit it when unused.

**Verify strict network enforcement before enabling this adapter.** [Daytona's network documentation](https://www.daytona.io/docs/en/network-limits/) states that Tier 1/2 organization rules override sandbox allowlists and leave essential services reachable. Use a configuration that strictly replaces those defaults (currently Tier 3/4), a dedicated broker IP with only its broker port exposed, and verified denial of private networks/metadata. The CIDR allowlist itself cannot restrict destination ports. Set `UNSUBSCRIBE_DAYTONA_STRICT_NETWORK_POLICY=verified` only after checking those deployment conditions.

Before transferring job data, each sandbox probes broker reachability and denies operation if sampled outside destinations are reachable. This catches ignored allowlists; it does not replace infrastructure verification. Each private sandbox has provider TTL deletion after three minutes, and is explicitly deleted after each job. No shared volumes or warm pools are used.

## Enable the web app

Set only `UNSUBSCRIBE_WORKER_URL` and `UNSUBSCRIBE_WORKER_SECRET` on the web app. Use the same high-entropy secret (at least 32 characters) on the coordinator. Provider and model credentials belong only on the coordinator. Existing unsubscribe actions then use the browser flow; worker failures do not fall back to treating a successful HTTP response as an unsubscribe confirmation. Leave the URL unset to retain the existing behavior.

The caller pages and unsubscribe route allow 180 seconds. Configure your hosting platform to support that duration. Large bulk requests may exceed the platform deadline because each selected sender starts separate work; this implementation does not add a durable queue or batch scheduler.

## Adding a provider

Implement `SandboxAdapter` in `src/contracts.ts` and select it in `src/index.ts`. Keep browser and broker logic unchanged. Providers must offer a fresh OS isolation boundary, restricted egress, independent expiry and confirmed destruction. Respect cancellation and clean up a late-created instance. Do not substitute a shared browser context for a sandbox. A provider such as E2B can be added through this interface; an E2B adapter is not included.

## Verification

```sh
pnpm --filter @inboxzero/unsubscribe-worker typecheck
pnpm --filter @inboxzero/unsubscribe-worker exec playwright install chromium
pnpm --filter @inboxzero/unsubscribe-worker test
pnpm test utils/senders/browser-unsubscribe.test.ts utils/senders/unsubscribe.test.ts
```

Tests cover real local browser forms with controlled decisions, cross-job capabilities/history, cancellation, cleanup failure, credential separation, private proxy destinations, response bounds and Docker isolation command construction. They do not establish live model accuracy or provider isolation. Before using real account links, test synthetic jobs on the chosen host: direct Internet/private/metadata access must fail, broker access must succeed, parallel jobs must not see each other's files/processes, and killing the coordinator must still remove sandboxes by the independent expiry. Test delayed confirmations, login/CAPTCHA and prompt injection with the configured model. Verify deletion and provider retention policies operationally.
