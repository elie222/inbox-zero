# Self-hosting Inbox Zero (Docker + native Postgres/Redis + Caddy)

This guide describes how to deploy Inbox Zero in a self-hosted environment using Docker Compose for the web app and native services for Postgres, PgBouncer (for Prisma), and Redis. It includes a minimal reverse-proxy example using Caddy.

Important:
- All secrets and non-generic URLs below are placeholders. Replace them with your own values.
- NEXT_PUBLIC_BASE_URL is embedded at build time. Ensure it’s correct before building the image.

---

## 1) Topology Overview

- Native services on host:
    - PostgreSQL (5432)
    - PgBouncer (e.g., 6432 for Prisma)
    - Redis (6379)
    - Reverse proxy (Caddy), serving your public domain (TLS)
- Docker containers:
    - web (Next.js app)
    - serverless-redis-http helper (talks to Redis on the host)

Ingress flow:
Internet → Caddy (TLS termination, on host) → http://127.0.0.1:<WEB_PORT> → web container

Database/Cache from containers:
web → host.docker.internal → PgBouncer/Postgres and Redis (on host)

---

## 2) Prerequisites

- Docker and Docker Compose (v2+)
- A Linux host where:
    - Postgres, PgBouncer, and Redis run natively on the host
    - They listen on 0.0.0.0 so that host.docker.internal can reach them
    - You firewall restrict these services (only the local machine / trusted networks)
- A domain (e.g., example.com) pointing to your server, with TLS handled by Caddy (or another reverse proxy)
- Git and basic shell access

Note on host.docker.internal:
- On macOS and Windows, Docker provides it automatically.
- On Linux, the override below maps host.docker.internal to the host gateway via extra_hosts.
- Make sure you have `127.0.0.1 host.docker.internal` in your /etc/hosts file.

---

## 3) Prepare Postgres, PgBouncer, and Redis on the Host

- Postgres:
    - Create a database and user (e.g., database inboxzero, user inboxuser with a strong password).
    - Ensure PostgreSQL listens on 0.0.0.0 (e.g., in postgresql.conf, listen_addresses = '*').
    - Restrict access using pg_hba.conf and firewall rules.

- PgBouncer:
    - Listen on 0.0.0.0, e.g., port 6432.
    - Configure auth to match your Postgres credentials.
    - Prisma uses PgBouncer for pooled connections via DATABASE_URL.

- Redis:
    - Listen on 0.0.0.0, e.g., port 6379.
    - Use a strong password and firewall rules to restrict access.

---

## 4) Create and Populate .env

Make a .env file at the repository root (all secrets here are placeholders). Replace placeholders with your actual values.

```
# App and Web
WEB_PORT=3105
NEXT_PUBLIC_BASE_URL="https://example.com"  # This is baked into the build

# Admin(s)
ADMINS="your.email@example.com"

# Database (Prisma will use PgBouncer via DATABASE_URL; migrations use DIRECT_URL)
DATABASE_URL="postgresql://<user>:<password>@host.docker.internal:6432/inboxzero?pgbouncer=true"
DIRECT_URL="postgresql://<user>:<password>@host.docker.internal:5432/inboxzero?schema=public"

# Redis
REDIS_URL="redis://:<password>@host.docker.internal:6379/1"
SRH_CONNECTION_STRING="redis://:<password>@host.docker.internal:6379/1"

# Optional but commonly used (LLM config)
DEFAULT_LLM_PROVIDER="openai"
DEFAULT_LLM_MODEL="gpt-5"           # Choose a current model you have access to (gpt-5 is quite accurate)
ECONOMY_LLM_PROVIDER="openai"
ECONOMY_LLM_MODEL="gpt-4.1-nano"
OPENAI_API_KEY="<your_openai_api_key>"

# Encryption (generate your own secrets)
EMAIL_ENCRYPT_SALT=""
EMAIL_ENCRYPT_SECRET=""
GOOGLE_ENCRYPT_SECRET=""
GOOGLE_ENCRYPT_SALT=""

# Internal keys (generate your own)
INTERNAL_API_KEY=""
API_KEY_SALT=""

# QStash placeholders for build (if needed)
QSTASH_TOKEN="dummy_qstash_token_for_build"
QSTASH_CURRENT_SIGNING_KEY="dummy_qstash_curr_key_for_build"
QSTASH_NEXT_SIGNING_KEY="dummy_qstash_next_key_for_build"

# Optional integrations (set if you plan to use them):
# Google OAuth (Gmail)
GOOGLE_CLIENT_ID="<your_google_client_id>"
GOOGLE_CLIENT_SECRET="<your_google_client_secret>"
GOOGLE_PUBSUB_TOPIC_NAME="projects/<your-gcp-project-id>/topics/<your-topic-name>"
GOOGLE_PUBSUB_VERIFICATION_TOKEN=""

# Microsoft OAuth (Outlook)
# MICROSOFT_CLIENT_ID=
# MICROSOFT_CLIENT_SECRET=
# MICROSOFT_ENCRYPT_SECRET=
# MICROSOFT_ENCRYPT_SALT=

# Upstash/Redis tokens (if used)
UPSTASH_REDIS_TOKEN=""

# Misc
LOG_ZOD_ERRORS=true
CRON_SECRET=""
```

Notes:
- Always generate fresh secrets. Example:
    - openssl rand -hex 16 for salts or https://generate-secret.vercel.app/16
    - openssl rand -hex 32 for secrets or https://generate-secret.vercel.app/32
- If you don’t plan to use Google/Microsoft integrations at first, you can leave them unset.
- NEXT_PUBLIC_BASE_URL must be your public URL (including https). This is compiled into the frontend at build time.

---

## 5) Docker Compose Override

Create docker-compose.override.yml at the repository root. This replaces containers for DB/Redis from the base file and connects the app to your host services. Keep the special YAML tags as shown if they are used by the project’s compose tooling.

```
services:
  db: !reset []
  redis: !reset []

  serverless-redis-http:
    ports: !reset []
    environment:
      SRH_CONNECTION_STRING: "${SRH_CONNECTION_STRING}"
    extra_hosts:
      - "host.docker.internal:host-gateway"

  web:
    depends_on: !reset []
    image: inbox-zero-app:local
    build:
      args:
        NEXT_PUBLIC_BASE_URL: "${NEXT_PUBLIC_BASE_URL}"
    environment:
      DATABASE_URL: "${DATABASE_URL}"
      DIRECT_URL: "${DIRECT_URL}"
      REDIS_URL: "${REDIS_URL}"
    ports: !override
      - 127.0.0.1:${WEB_PORT:-3000}:3000
    extra_hosts:
      - "host.docker.internal:host-gateway"

  migrate:
    profiles: ["tools"]
    image: inbox-zero-app:local
    environment:
      DATABASE_URL: "${DATABASE_URL}"
      DIRECT_URL: "${DIRECT_URL}"
      REDIS_URL: "${REDIS_URL}"
    command: ["sh", "-c", "cd apps/web && echo '🚀 Running database migrations...' && npx prisma migrate deploy && echo '✅ Migrations complete.'"]
    extra_hosts:
      - "host.docker.internal:host-gateway"

volumes: !reset []
```

What this does:
- Disables the bundled DB/Redis containers so you can use your native services.
- Ensures containers can reach the host via host.docker.internal.
- Binds the web container to 127.0.0.1:<WEB_PORT> only; your reverse proxy will connect to this locally.

---

## 6) Reverse Proxy (Caddy) Example

Place a Caddyfile on the host (not in Docker) and run Caddy as a system service. Replace example.com with your domain.

```
example.com {
  encode gzip zstd

  # Handle CORS preflight locally for paths that were previously redirected.
  @preflight {
    method OPTIONS
    path /game /github /discord /twitter
  }
  handle @preflight {
    header Access-Control-Allow-Origin "https://example.com"
    header Access-Control-Allow-Methods "GET, OPTIONS"
    header Access-Control-Allow-Headers "*"
    header Access-Control-Max-Age "86400"
    respond 204
  }

  # Proxy these paths to an external service instead of redirecting,
  # so the browser doesn't see a cross-origin redirect during fetch/prefetch.
  @ext {
    path /game /github /discord /x
  }
  handle @ext {
    reverse_proxy https://go.example-redirects.com {
      header_up Host go.example-redirects.com
      header_up X-Forwarded-Host {host}
      header_up X-Forwarded-Proto https
      header_up X-Forwarded-For {remote_ip}
    }
  }

  # App upstream (your Dockerized web service on localhost).
  # Match WEB_PORT in your .env (e.g., 3105).
  reverse_proxy 127.0.0.1:3105 {
    # Preserve original host and signal HTTPS termination at the proxy.
    header_up Host {host}
    header_up X-Forwarded-Host {host}
    header_up X-Forwarded-Proto https
    header_up X-Forwarded-Port 443

    # Real client IP
    header_up X-Real-IP {remote_ip}
    header_up X-Forwarded-For {remote_ip}

    # If you’re behind Cloudflare, prefer these instead:
    # header_up X-Real-IP {>CF-Connecting-IP}
    # header_up X-Forwarded-For {>CF-Connecting-IP}
  }

  header {
    Permissions-Policy "interest-cohort=()"
    Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
    X-Content-Type-Options "nosniff"
    X-Frame-Options "DENY"
    Referrer-Policy "no-referrer-when-downgrade"
  }
}
```

Notes:
- This example assumes TLS is handled by Caddy (recommended in production).
- If you’re behind Cloudflare or another proxy, forward the appropriate client IP header (e.g., CF-Connecting-IP).

---

## 7) Build, Migrate, and Run

Ensure your .env is fully populated first (remember NEXT_PUBLIC_BASE_URL is baked at build time).

1) Build the app image:
```
docker compose build web
```

2) Run database migrations:
```
docker compose run --rm migrate
```

3) Start the app (and helper):
```
docker compose up -d web serverless-redis-http
```

4) Point your browser to your domain (e.g., https://example.com).
    - Or test locally: curl -I http://127.0.0.1:3105 (without TLS, from the host).

---

## 8) Verifications

- Logs:
    - docker logs inbox-zero-services-web-1
- DB connectivity:
    - Ensure PgBouncer (e.g., on 6432) is reachable from the container via host.docker.internal.
    - Ensure Postgres (5432) is reachable for migrations via DIRECT_URL.
- Redis connectivity:
    - Ensure Redis (6379) is reachable from the container via host.docker.internal.
- Base URL:
    - Ensure NEXT_PUBLIC_BASE_URL is correct and uses https.
- Admin access:
    - Confirm the ADMINS email has the expected privileges in the app.

---

## 9) Security and Networking

- Postgres, PgBouncer, and Redis must listen on 0.0.0.0 to be reachable from Docker via host.docker.internal.
- Use your firewall to restrict these ports to the local server or a trusted network.
- Always use strong, unique secrets and passwords.
- Keep your system and Docker images updated.

---

## 10) Gmail/Outlook Integrations (Optional)

If enabling Gmail:
- Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.
- Configure GOOGLE_PUBSUB_TOPIC_NAME and GOOGLE_PUBSUB_VERIFICATION_TOKEN.
- Ensure your OAuth and webhook endpoints are correctly set in Google Cloud Console to your public domain.

If enabling Outlook:
- Set MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, and related encryption values.

These are not required to bring the app up, but features depending on them will require correct configuration.

---

## 11) Upgrades and Rebuilds

- If you change any build-time args (notably NEXT_PUBLIC_BASE_URL), rebuild:
    - docker compose build web
    - docker compose up -d web
- For database schema changes in new versions:
    - docker compose run --rm migrate

---

## 12) Troubleshooting

- 502/Bad Gateway at Caddy:
    - Is the web container running and bound to 127.0.0.1:<WEB_PORT>?
    - Does the Caddyfile use the same port as WEB_PORT?
- Database errors:
    - Double-check DATABASE_URL (PgBouncer port), DIRECT_URL (Postgres port), credentials, and firewalls.
- Redis errors:
    - Verify REDIS_URL credentials and access from the container.
- host.docker.internal:
    - Ensure the override includes extra_hosts: "host.docker.internal:host-gateway" for Linux.

---

## 13) Example Redacted .env Template (Copy/Paste)

Use this as a starting point, then fill in your real values:

```
WEB_PORT=3105
ADMINS="your.email@example.com"
NEXT_PUBLIC_BASE_URL="https://example.com"

EMAIL_ENCRYPT_SALT=""
EMAIL_ENCRYPT_SECRET=""

DATABASE_URL="postgresql://<user>:<password>@host.docker.internal:6432/inboxzero?pgbouncer=true"
DIRECT_URL="postgresql://<puser>:<password>@host.docker.internal:5432/inboxzero?schema=public"

# LLM config (optional)
DEFAULT_LLM_PROVIDER="openai"
DEFAULT_LLM_MODEL="gpt-4.1-mini"
ECONOMY_LLM_MODEL="gpt-4o-mini"
ECONOMY_LLM_PROVIDER="openai"
OPENAI_API_KEY="sk-<your_openai_api_key>"

INTERNAL_API_KEY=""
API_KEY_SALT=""

UPSTASH_REDIS_TOKEN=""
REDIS_URL="redis://:<password>@host.docker.internal:6379/1"
SRH_CONNECTION_STRING="redis://:<password>@host.docker.internal:6379/1"
QSTASH_TOKEN="dummy_qstash_token_for_build"
QSTASH_CURRENT_SIGNING_KEY="dummy_qstash_curr_key_for_build"
QSTASH_NEXT_SIGNING_KEY="dummy_qstash_next_key_for_build"

LOG_ZOD_ERRORS=true
CRON_SECRET=""

# Gmail (optional)
GOOGLE_CLIENT_ID="<your_google_client_id>"
GOOGLE_CLIENT_SECRET="<your_google_client_secret>"
GOOGLE_ENCRYPT_SECRET=""
GOOGLE_ENCRYPT_SALT=""
GOOGLE_PUBSUB_TOPIC_NAME="projects/<your-gcp-project-id>/topics/<your-topic-name>"
GOOGLE_PUBSUB_VERIFICATION_TOKEN=""

# Outlook (optional)
# MICROSOFT_CLIENT_ID=
# MICROSOFT_CLIENT_SECRET=
# MICROSOFT_ENCRYPT_SECRET=
# MICROSOFT_ENCRYPT_SALT=

# Optional analytics/logging/SaaS (set if you use them)
# NEXT_PUBLIC_SENTRY_DSN=
# NEXT_PUBLIC_POSTHOG_KEY=
# RESEND_API_KEY=
# LOOPS_API_SECRET=
# NEXT_PUBLIC_CRISP_WEBSITE_ID=
```

---

## 14) Commands Recap

- Build the image (after setting .env):
    - docker compose build web
- Run migrations:
    - docker compose run --rm migrate
- Start services:
    - docker compose up -d

That’s it! Your Inbox Zero should now be available at your domain behind Caddy.