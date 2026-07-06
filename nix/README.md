# Nix packaging

Fully nix-native build of Inbox Zero. No Docker involved.

## Layout

- `flake.nix` — pins nixpkgs, exposes `packages.inbox-zero` (= `default`), the
  `overlays.default`, and `devShells.default`.
- `pkgs/inbox-zero.nix` — the build (Next.js standalone server + BullMQ worker).
- `fonts/` — vendored Google Fonts + the offline preload shim (see below).

## Build & run

```sh
nix build .#inbox-zero
./result/bin/inbox-zero-server   # Next.js standalone server
./result/bin/inbox-zero-worker   # BullMQ background worker
```

Both bins have absolute node + store paths baked in (no `$APPS_DIR` / PATH
setup needed). They still require the app's runtime env vars (DATABASE_URL,
GOOGLE_CLIENT_ID, REDIS_URL, …) — verified: the server boots to "Ready" and
then fails env validation; the worker loads its deps and hits its own
`REDIS_URL is required` check.

Dev shell: `nix develop` (Node 24, pnpm, typescript, docker-compose, curl, jq).

## Design notes / gotchas (why it's built this way)

### `DOCKER_BUILD=true` is not Docker
It's the **app's own** flag. `next.config.ts` only reads it to pick
`output: "standalone"`, which the Nix package needs for a self-contained
`server.js`. Renaming it is an app change, so we set it in the build env with a
comment. `NEXT_PRIVATE_STANDALONE` is NOT a Next 16 build trigger (only
`NEXT_PRIVATE_STANDALONE_CONFIG` exists, unrelated) — do not re-add it.

### Offline Google Fonts (`fonts/`)
The Nix sandbox has no network, but `app/layout.tsx` (Geist) and
`app/(app)/layout.tsx` (Inter) use `next/font/google`, which fetches at build
time. Fix:
- Vendored the CSS (`Geist.css`, `Inter.css`) and the 12 referenced `.woff2`
  files. Both fonts: weights 400/500/600/700, `display: swap`. The vendored CSS
  is the full `css2` response (all subsets Google serves — latin, latin-ext,
  greek, cyrillic, vietnamese, …); the app requests `subsets: ["latin"]`, which
  only controls which subset is preloaded, not what the CSS contains.
- `fonts/font-mock.cjs` is loaded via `NODE_OPTIONS="--require …"` during
  `next build`. It:
  1. Patches Next 16's `fetch-css-from-google-fonts` / `fetch-font-file`
     modules (matched by basename — the loader requires them by relative path)
     to return the vendored files instead of fetching. Both stubs are `async`
     (the loader calls `.catch` on them).
  2. Registers a `module.registerHooks` resolver that rewrites
     `next/constants` → `next/constants.js`. `next` ships no `exports` map, so
     `@sentry/nextjs`'s ESM `import "next/constants"` fails under Node 24's
     strict resolver in the pnpm store layout. (Docker builds dodge this via a
     different node_modules layout; instrumentation.ts always imports Sentry.)

If the fonts or their params change, re-vendor: fetch the `css2` URLs with a
modern browser User-Agent (so Google serves woff2), then download every
`fonts.gstatic.com/*.woff2` the CSS references into `fonts/`.

### buildPhase cwd
`next build` runs in `apps/web`, then cd's back to the captured `buildRoot`
(the writable build dir) — NOT `$src` (the read-only store copy). Getting this
wrong makes installPhase read an empty `.next` and fail with a cryptic
`cp: missing destination file operand`.

### Worker is bundled, not a separate derivation
`apps/worker` is self-contained ESM needing only `bullmq` + `ioredis`. We
esbuild-bundle it to a single `apps/worker/index.mjs` in installPhase:
`--format=esm` (worker uses top-level await), `--external:msgpackr-extract`
(optional native accel, msgpackr falls back to JS), and a `createRequire`
banner (bullmq `require()`s node builtins like `child_process`; esbuild's ESM
`__require` shim throws without it).

Why bundle instead of copying node_modules:
- `cp -rL apps/worker/node_modules` drops pnpm's sibling transitive deps
  (e.g. `tslib`) → runtime "Cannot find module".
- `pnpm deploy` re-resolves against the registry; `--legacy`/`--offline` need a
  metadata mirror the fetchPnpmDeps CAS store doesn't have → fails offline.

## Maintenance notes

- **pnpmDeps hash** — `pkgs/inbox-zero.nix` pins
  `hash = "sha256-…"`. It must be updated whenever `pnpm-lock.yaml` changes
  (a stale hash fails the build with a hash mismatch).
- **Font binaries in-repo** — the 12 `.woff2` (~300 KB total) are committed
  directly. If that becomes undesirable, alternatives are git-lfs or fetching
  via a pinned fixed-output derivation.
- **Worker bundle** — a single `index.mjs` (~1.5 MB). If the worker later gains
  workspace-package deps, bundling gets fiddly; a separate derivation may be
  warranted then.
