# Docker Build Guide - Runtime Environment

This project is configured to use runtime environment variables for `NEXT_PUBLIC_*` values, including `NEXT_PUBLIC_BASE_URL`.

We rely on `@t3-oss/env-nextjs` with `experimental__runtimeEnv` so you can change public env vars without rebuilding the image, as long as you run the Next.js server (not `next export`).

## Building the image

Build as usual; there is no need to pass `NEXT_PUBLIC_BASE_URL` as a build-arg:

```bash
docker build -t inbox-zero -f docker/Dockerfile.prod .
```

## Running with runtime env

Pass `NEXT_PUBLIC_BASE_URL` (and other env) at container runtime:

```bash
docker run -p 3000:3000 \
  -e NEXT_PUBLIC_BASE_URL="https://your-domain.com" \
  -e DATABASE_URL="postgres://..." \
  -e AUTH_SECRET="..." \
  inbox-zero
```

## Docker Compose

Compose injects environment at runtime; no build args are needed:

```yaml
services:
  web:
    build:
      context: .
      dockerfile: docker/Dockerfile.prod
    environment:
      NEXT_PUBLIC_BASE_URL: ${NEXT_PUBLIC_BASE_URL:-http://localhost:3000}
      DATABASE_URL: ${DATABASE_URL}
      # ... other envs
    ports:
      - "3000:3000"
```

## Notes

- Do not bake `NEXT_PUBLIC_BASE_URL` into the image; provide it via runtime env.
- This works for server and client code in this repo because env exposure is configured via `experimental__runtimeEnv` in `apps/web/env.ts`.
- If you change to a fully static export (`next export`), you would lose runtime env behavior.

## Security

- Never pass secrets as build-args; always inject secrets via runtime environment or a secret manager.
- Continue scanning images (Trivy/Docker Scout) as usual.
