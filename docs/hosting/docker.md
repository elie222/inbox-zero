# Self-Hosting Inbox Zero with Docker on a VPS

This guide will walk you through self-hosting the Inbox Zero application on a VPS using Docker and Docker Compose.

## Prerequisites

### Requirements

- VPS with Minimum 2GB RAM, 2 CPU cores, 20GB storage and linux distribution with [minimum security](https://help.ovhcloud.com/csm/en-gb-vps-security-tips?id=kb_article_view&sysparm_article=KB0047706)
- Domain name pointed to your VPS IP
- SSH access to your VPS

## Step-by-Step VPS Setup

### 1. Prepare Your VPS

Connect to your VPS and install Docker Engine by following the [the official guide](https://docs.docker.com/engine/install) and the [Post installation steps](https://docs.docker.com/engine/install/linux-postinstall/#manage-docker-as-a-non-root-user)

### 2. Setup Docker Compose

**Option A: Clone the repository**

```bash
git clone https://github.com/elie222/inbox-zero.git
cd inbox-zero
cp apps/web/.env.example apps/web/.env
```

This is simpler if you want to easily update your deployment later with `git pull`.

**Option B: Download only the necessary files**

```bash
mkdir inbox-zero
cd inbox-zero
curl -O https://raw.githubusercontent.com/elie222/inbox-zero/main/docker-compose.yml
mkdir -p apps/web
curl -o apps/web/.env https://raw.githubusercontent.com/elie222/inbox-zero/main/apps/web/.env.example
```

### 3. Configure

Edit the environment file with your production settings:

```bash
nano apps/web/.env
```

For detailed configuration instructions including all required environment variables, OAuth setup, and LLM configuration, see the [main README.md configuration section](../../README.md#updating-env-file-secrets).

#### Using External Database Services (Optional)

The `docker-compose.yml` supports different deployment modes using profiles:

**All-in-one (default):** Includes Postgres and Redis containers
```bash
NEXT_PUBLIC_BASE_URL=https://yourdomain.com docker compose --profile all up -d
```

**External database only:** Use managed Postgres (RDS, Neon, Supabase) with local Redis
```bash
# Set DATABASE_URL and DIRECT_URL in .env to your external database
NEXT_PUBLIC_BASE_URL=https://yourdomain.com docker compose --profile local-redis up -d
```

**External Redis only:** Use managed Redis (Upstash, ElastiCache) with local Postgres
```bash
# Set UPSTASH_REDIS_URL and UPSTASH_REDIS_TOKEN in .env
NEXT_PUBLIC_BASE_URL=https://yourdomain.com docker compose --profile local-db up -d
```

**Fully external:** Use managed services for both (production recommended)
```bash
# Set DATABASE_URL, DIRECT_URL, UPSTASH_REDIS_URL, and UPSTASH_REDIS_TOKEN in .env
NEXT_PUBLIC_BASE_URL=https://yourdomain.com docker compose up -d
```

**Important**: The `NEXT_PUBLIC_BASE_URL` must be set as a shell environment variable when running `docker compose up` (as shown below). Setting it in `apps/web/.env` will not work because `docker-compose.yml` overrides it.

### 4. Deploy

Pull and start the services with your domain:

```bash
# Set your domain and start all services
NEXT_PUBLIC_BASE_URL=https://yourdomain.com docker compose up -d
```

The pre-built Docker image is hosted at `ghcr.io/elie222/inbox-zero:latest` and will be automatically pulled.

### 5. Run Database Migrations

Wait for the containers to start, then run the database migrations:

```bash
# Wait a few seconds for the database to be ready, then run migrations
docker compose exec web npx prisma migrate deploy
```

**Note:** You'll need to run this command again after pulling updates to apply any new database schema changes.

### 6. Access Your Application

Your application should now be accessible at:
- `http://your-server-ip:3000` (if accessing directly)
- `https://yourdomain.com` (if you've set up a reverse proxy with SSL)

**Note:** For production deployments, you should set up a reverse proxy (like Nginx, Caddy, or use a cloud load balancer) to handle SSL/TLS termination and route traffic to your Docker container.

## Updates

To update to the latest version:

```bash
# Pull the latest image
docker compose pull web

# Restart with the new image
NEXT_PUBLIC_BASE_URL=https://yourdomain.com docker compose up -d

# Run any new database migrations
docker compose exec web npx prisma migrate deploy
```
## Monitoring

```bash
# View logs
docker compose logs -f web
docker compose logs -f db
```

## Building from Source (Optional)

If you prefer to build the image yourself instead of using the pre-built one:

```bash
# Clone the repository
git clone https://github.com/elie222/inbox-zero.git
cd inbox-zero

# Configure environment
cp apps/web/.env.example apps/web/.env
nano apps/web/.env

# Build and start
docker compose build
NEXT_PUBLIC_BASE_URL=https://yourdomain.com docker compose up -d
```

**Note**: Building from source requires significantly more resources (4GB+ RAM recommended) and takes longer than pulling the pre-built image.

