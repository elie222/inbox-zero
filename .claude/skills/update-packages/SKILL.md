---
name: update-packages
description: Update workspace packages while respecting the repo's pinned package list in .ncurc.cjs. Use when the user asks to update dependencies or refresh package versions.
---

# Update Packages

Use this workflow when updating dependencies in this repo.

## Steps

1. Check the pinned package list in `.ncurc.cjs`. Do not upgrade packages listed there.
2. Keep the repo on Node 24. If you change Node runtime settings, update `.nvmrc`, `engines.node`, `@types/node`, Dockerfiles, and CI together.
3. Update manifests across the workspace:

```sh
pnpm dlx npm-check-updates -u -ws
```

4. Refresh the lockfile and install updated packages:

```sh
pnpm install
```

5. Verify the update:

```sh
pnpm test
pnpm lint
```

## Notes

- `npm-check-updates` reads `.ncurc.cjs`, so the reject list is applied during the manifest update.
- `pnpm install` may also bump the root `packageManager` field and regenerate `pnpm-lock.yaml`.
- Do not run `pnpm dev` or `pnpm build` unless the user explicitly asks.
- Keep `@hookform/resolvers` in the `.ncurc.cjs` reject list and pinned to `4.1.0` while `apps/web` remains on `zod@3.25.76`. The `5.x` resolver line imports `zod/v4/core`, which has caused local Next.js/Turbopack resolution failures even though the app code still uses Zod 3.
