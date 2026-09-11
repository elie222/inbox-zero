# Inbox Zero Helm Chart

This chart maps the Docker Compose self-hosting stack onto Kubernetes:

- `web` Deployment for the Next.js app
- `worker` Deployment for the optional BullMQ worker
- CronJobs for scheduled endpoints
- optional bundled Postgres, Redis, and Redis HTTP bridge for demos
- managed Postgres and Redis configuration for production
- optional Ingress and ServiceAccount resources

For production, use managed Postgres and managed Redis. The bundled StatefulSets are intended for demos and small self-hosted installs, not production workloads that need backups, failover, monitoring, and tested restores.

## Documentation

Use the Kubernetes hosting guide for installation and operations:

- [Kubernetes Deployment](../../docs/hosting/kubernetes.mdx)
- [Environment Variables](../../docs/hosting/environment-variables.mdx)

## Install

```bash
helm upgrade --install inbox-zero ./charts/inbox-zero \
  -n inbox-zero \
  --create-namespace \
  -f values.prod.yaml
```

## Production Shape

Use managed data services through existing Kubernetes Secrets:

```yaml
externalDatabase:
  enabled: true
  existingSecret:
    name: inbox-zero-database

externalRedis:
  enabled: true
  existingSecret:
    name: inbox-zero-redis

existingSecret: inbox-zero-secrets
```

The app environment keys belong in `inbox-zero-secrets`; see the environment variable reference for the full list.

## Demo Data Services

Bundled Postgres, Redis, and Redis HTTP require explicit secret values:

```yaml
postgresql:
  auth:
    password: replace-with-random-value

redis:
  auth:
    password: replace-with-random-value

redisHttp:
  token: replace-with-random-value
```
