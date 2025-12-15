# Self-Hosting Inbox Zero with Docker on a VPS

This guide will walk you through self-hosting the Inbox Zero application on a VPS using Docker and Docker Compose.

## Prerequisites

### Requirements

- VPS with Minimum 2GB RAM, 2 CPU cores, 20GB storage and linux distribution with [minimum security](https://help.ovhcloud.com/csm/en-gb-vps-security-tips?id=kb_article_view&sysparm_article=KB0047706)
- Domain name pointed to your VPS IP
- SSH access to your VPS

## Step-by-Step VPS Setup

### 1. Prepare Your VPS

Connect to your VPS and install:

1. **Docker Engine**: Follow [the official guide](https://docs.docker.com/engine/install) and the [Post installation steps](https://docs.docker.com/engine/install/linux-postinstall/#manage-docker-as-a-non-root-user)
2. **Node.js**: Follow [the official guide](https://nodejs.org/en/download) (required for the setup CLI)

### 2. Setup Docker Compose

Clone the repository:

```bash
git clone https://github.com/elie222/inbox-zero.git
cd inbox-zero
```

### 3. Configure

Install dependencies and run the setup CLI to create your environment file with auto-generated secrets:

```bash
npm install
npm run setup
```

You can also copy `.env.example` to `.env` and set the values yourself.

If doing this manually edit then you'll need to configure:
- **Google OAuth**: `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
- **LLM Provider**: Uncomment one provider block and add your API key
- **Optional**: Microsoft OAuth, external Redis, etc.

For detailed configuration instructions, see the [Environment Variables Reference](./environment-variables.md).

**Note**: If you only want to use Microsoft and not Google OAuth then add skipped for the the Google client id and secret.

**Note**: The first section of `.env.example` variables that are commented out. If you're using Docker Compose leave them commented - Docker Compose sets these automatically with the correct internal hostnames.

### 4. Deploy

Pull and start the services with your domain:

```bash
NEXT_PUBLIC_BASE_URL=https://yourdomain.com docker compose --env-file apps/web/.env --profile all up -d
```

The pre-built Docker image is hosted at `ghcr.io/elie222/inbox-zero:latest` and will be automatically pulled.

**Important**: The `NEXT_PUBLIC_BASE_URL` must be set as a shell environment variable when running `docker compose up` (as shown above). Setting it in `apps/web/.env` will not work because `docker-compose.yml` overrides it.

#### Using External Database Services (Optional)

The `docker-compose.yml` supports different deployment modes using profiles:

| Profile | Description | Use when |
|---------|-------------|----------|
| `--profile all` | Includes Postgres and Redis containers | Default, simplest setup |
| `--profile local-redis` | Local Redis only | Using managed Postgres (RDS, Neon, Supabase) |
| `--profile local-db` | Local Postgres only | Using managed Redis (Upstash, ElastiCache) |
| *(no profile)* | No local databases | Using managed services for both (production recommended) |

For external services, set the appropriate environment variables in `apps/web/.env`:
- **External Postgres**: Set `DATABASE_URL` and `DIRECT_URL`
- **External Redis**: Set `UPSTASH_REDIS_URL` and `UPSTASH_REDIS_TOKEN`

### 5. Check Logs

Wait for the containers to start, then run the database migrations:

```bash
# Check that containers are running (STATUS should show "Up")
docker ps
# Check logs. This can take 30 seconds to complete
docker logs inbox-zero-services-web-1 -f
```

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
NEXT_PUBLIC_BASE_URL=https://yourdomain.com docker compose --env-file apps/web/.env --profile all up -d
```

## Monitoring

```bash
# View logs
docker compose logs -f web
docker compose logs -f db
```

## Scheduled Tasks

The Docker Compose setup includes a `cron` container that handles scheduled tasks automatically:

| Task | Frequency | Endpoint | Description |
|------|-----------|----------|-------------|
| **Email watch renewal** | Every 6 hours | `/api/watch/all` | Renews Gmail/Outlook push notification subscriptions |
| **Meeting briefs** | Every 15 minutes | `/api/meeting-briefs` | Sends pre-meeting briefings to users with the feature enabled |

**If you're not using Docker Compose** you need to set up cron jobs manually:

```bash
# Email watch renewal - every 6 hours
0 */6 * * * curl -s -X GET "https://yourdomain.com/api/watch/all" -H "Authorization: Bearer YOUR_CRON_SECRET"

# Meeting briefs - every 15 minutes (optional, only if using meeting briefs feature)
*/15 * * * * curl -s -X GET "https://yourdomain.com/api/meeting-briefs" -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Replace `YOUR_CRON_SECRET` with the value of `CRON_SECRET` from your `.env` file.

## Optional: QStash for Advanced Features

[Upstash QStash](https://upstash.com/docs/qstash/overall/getstarted) is a serverless message queue that enables scheduled and delayed actions. It's optional but recommended for the full feature set.

**Features that require QStash:**

| Feature | Without QStash | With QStash |
|---------|---------------|-------------|
| **Email digest** | ❌ Not available | ✅ Full support |
| **Delayed/scheduled email actions** | ❌ Not available | ✅ Full support |
| **AI categorization of senders*** | ✅ Works (sync) | ✅ Works (async with retries) |
| **Bulk inbox cleaning*** | ❌ Not available | ✅ Full support |

*Early access features - available on the Early Access page.

**Cost**: QStash has a generous free tier and scales to zero when not in use. See [QStash pricing](https://upstash.com/pricing/qstash).

**Setup**: Add your QStash credentials to `.env`:
```bash
QSTASH_TOKEN=your-qstash-token
QSTASH_CURRENT_SIGNING_KEY=your-signing-key
QSTASH_NEXT_SIGNING_KEY=your-next-signing-key
```

Adding alternative scheduling backends (like Redis-based scheduling) for self-hosted users is on our roadmap.

## Building from Source (Optional)

If you prefer to build the image yourself instead of using the pre-built one:

```bash
# Clone the repository
git clone https://github.com/elie222/inbox-zero.git
cd inbox-zero

# Install dependencies and configure environment (auto-generates secrets)
npm install
npm run setup
nano apps/web/.env

# Build and start
docker compose build
NEXT_PUBLIC_BASE_URL=https://yourdomain.com docker compose --env-file apps/web/.env --profile all up -d
```

**Note**: Building from source requires significantly more resources (4GB+ RAM recommended) and takes longer than pulling the pre-built image.

