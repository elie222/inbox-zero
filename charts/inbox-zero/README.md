# Inbox Zero Helm Chart

This chart maps the Docker Compose self-hosting stack onto Kubernetes:

- `web` Deployment: runs the Next.js standalone server from the published Inbox Zero image.
- `migrate` Job: runs Prisma migrations before Helm installs or upgrades the app when managed Postgres is enabled.
- `worker` Deployment: optional BullMQ worker using the same image and `/app/docker/scripts/start-worker.sh`.
- `cron` CronJobs: call the app's scheduled endpoints with `CRON_SECRET`.
- `postgresql` StatefulSet: optional in-cluster Postgres for simple installs.
- `redis` StatefulSet and `redis-http` Deployment: optional Redis plus an Upstash-compatible HTTP bridge.
- `ingress` and `service`: expose the web app inside or outside the cluster.

For production, use managed Postgres and managed Redis. The bundled StatefulSets are intended for demos and small self-hosted installs, not production workloads that need backups, failover, monitoring, and tested restores.

## Install

Create a values file with real secrets:

```yaml
ingress:
  enabled: true
  className: nginx
  hosts:
    - host: app.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: inbox-zero-tls
      hosts:
        - app.example.com

env:
  NEXT_PUBLIC_BASE_URL: https://app.example.com
  GOOGLE_PUBSUB_TOPIC_NAME: projects/example/topics/inbox-zero
  DEFAULT_LLM_PROVIDER: openai
  DEFAULT_LLM_MODEL: gpt-5.4-mini

secretEnv:
  AUTH_SECRET: change-me
  GOOGLE_CLIENT_ID: change-me
  GOOGLE_CLIENT_SECRET: change-me
  EMAIL_ENCRYPT_SECRET: change-me
  EMAIL_ENCRYPT_SALT: change-me
  INTERNAL_API_KEY: change-me
  API_KEY_SALT: change-me
  CRON_SECRET: change-me
  OPENAI_API_KEY: change-me
  GOOGLE_PUBSUB_VERIFICATION_TOKEN: change-me

postgresql:
  auth:
    password: replace-with-random-value

redis:
  auth:
    password: replace-with-random-value

redisHttp:
  token: replace-with-random-value
```

Then install:

```bash
helm upgrade --install inbox-zero ./charts/inbox-zero -n inbox-zero --create-namespace -f values.prod.yaml
```

## Recommended Production Values

Use managed Postgres and Redis by enabling the external service blocks:

```yaml
externalDatabase:
  enabled: true
  databaseUrl: postgresql://user:password@postgres.example.com:5432/inboxzero?schema=public
  directUrl: postgresql://user:password@postgres.example.com:5432/inboxzero?schema=public

externalRedis:
  enabled: true
  redisUrl: rediss://:password@redis.example.com:6379
  upstashRedisUrl: https://example.upstash.io
  upstashRedisToken: change-me
```

For production secrets, prefer pre-created Kubernetes Secrets:

```yaml
externalDatabase:
  enabled: true
  existingSecret:
    name: inbox-zero-database

externalRedis:
  enabled: true
  existingSecret:
    name: inbox-zero-redis
```

Those Secrets should contain:

```env
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...
REDIS_URL=rediss://...
UPSTASH_REDIS_URL=https://...
UPSTASH_REDIS_TOKEN=...
```

You can also keep all app secrets outside Helm:

```yaml
existingSecret: inbox-zero-secrets
existingConfigMap: inbox-zero-config
```

The existing Secret should contain the same environment-variable keys the app expects, such as `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `EMAIL_ENCRYPT_SECRET`, `EMAIL_ENCRYPT_SALT`, `INTERNAL_API_KEY`, and provider API keys.

If you use `existingSecret` with bundled Postgres or Redis, it must also contain `POSTGRES_PASSWORD`, `DATABASE_URL`, `DIRECT_URL`, `REDIS_PASSWORD`, `REDIS_URL`, `UPSTASH_REDIS_URL`, and `UPSTASH_REDIS_TOKEN`.

If you only use Microsoft OAuth, set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to non-empty placeholder values such as `skipped`.

## Background Jobs

The default chart enables the BullMQ worker:

```yaml
env:
  QUEUE_BACKEND: bullmq
worker:
  enabled: true
```

To use QStash instead:

```yaml
env:
  QUEUE_BACKEND: qstash
worker:
  enabled: false
secretEnv:
  QSTASH_TOKEN: change-me
  QSTASH_CURRENT_SIGNING_KEY: change-me
  QSTASH_NEXT_SIGNING_KEY: change-me
```

## Smoke Test

```bash
kubectl get pods -n inbox-zero
kubectl rollout status deploy/inbox-zero-web -n inbox-zero
kubectl port-forward svc/inbox-zero-web 3000:80 -n inbox-zero
curl http://localhost:3000/api/health
```

## Scaling Notes

With `externalDatabase.enabled=true`, Helm runs migrations in a pre-install/pre-upgrade Job and sets `SKIP_DB_MIGRATIONS=true` on the web pods. This keeps multi-replica web rollouts cleaner.

Bundled Postgres installs keep the web container's startup migration behavior because the database is created as part of the same Helm release.

Bundled Postgres, Redis, and Redis HTTP require explicit secret values. Generate them before installing, for example with `openssl rand -hex 32`.

CronJobs call the internal web Service, so they do not need public network access. If `CRON_SECRET` is empty, scheduled requests will fail once the app requires authorization for those endpoints.

Cron schedules are configured under `cron.jobs`. The defaults follow the Docker self-hosting setup, so some schedules differ from hosted deployment schedules.
