# Local Development Guide

Quick reference for running Inbox Zero locally.

## 🚀 Quick Start

```bash
# Navigate to project
cd /Users/sudipta/Workspace/personal/AI/Email/inbox-zero

# Start Docker services (if not already running)
docker-compose up -d db redis

# Start development server
pnpm run dev
```

**Access the app:** http://localhost:3000

---

## 📋 Prerequisites

Before first run, ensure you have:

- **Node.js** >= 22.0.0
- **pnpm** >= 10.17.1
- **Docker** and Docker Compose
- **PostgreSQL** (via Docker)
- **Redis** (via Docker)

---

## 🔧 Initial Setup (First Time Only)

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Configure Environment Variables

The `.env` file should already exist at `apps/web/.env`. Key variables:

```bash
# Database
DATABASE_URL="postgresql://postgres:password@localhost:5432/inboxzero?schema=public"

# Redis
REDIS_URL=redis://localhost:6380

# Auth
AUTH_SECRET=<your-secret>
EMAIL_ENCRYPT_SECRET=<your-secret>
EMAIL_ENCRYPT_SALT=<your-salt>

# Google OAuth
GOOGLE_CLIENT_ID=<your-client-id>
GOOGLE_CLIENT_SECRET=<your-client-secret>

# LLM Provider
DEFAULT_LLM_PROVIDER=openrouter
DEFAULT_LLM_MODEL=openai/gpt-4o-mini
OPENROUTER_API_KEY=<your-api-key>
```

### 3. Start Docker Services

```bash
docker-compose up -d db redis
```

### 4. Run Database Migrations

```bash
cd apps/web
pnpm prisma migrate dev
```

### 5. Start Dev Server

```bash
# From project root
pnpm run dev

# Or from apps/web
cd apps/web
pnpm run dev
```

---

## 🎯 Daily Development Workflow

### Start Everything

```bash
cd /Users/sudipta/Workspace/personal/AI/Email/inbox-zero

# Start Docker (if not running)
docker-compose up -d db redis

# Start dev server
pnpm run dev
```

### Stop Everything

```bash
# Stop dev server (if running in foreground)
Ctrl + C

# Or if running in background
pkill -f "next dev"

# Stop Docker services (optional - can leave running)
docker-compose down
```

---

## 🔍 Common Commands

### Development

| Command | Description |
|---------|-------------|
| `pnpm run dev` | Start dev server with Turbopack |
| `pnpm run build` | Build for production |
| `pnpm start` | Run production build |
| `pnpm lint` | Run linter |
| `pnpm test` | Run tests |

### Docker

| Command | Description |
|---------|-------------|
| `docker-compose up -d db redis` | Start PostgreSQL & Redis |
| `docker-compose down` | Stop all services |
| `docker-compose restart db` | Restart PostgreSQL |
| `docker-compose logs -f db` | View PostgreSQL logs |
| `docker ps` | Check running containers |

### Database (Prisma)

| Command | Description |
|---------|-------------|
| `pnpm prisma migrate dev` | Run migrations |
| `pnpm prisma migrate reset` | Reset database (⚠️ deletes data) |
| `pnpm prisma generate` | Generate Prisma client |
| `pnpm prisma studio` | Open Prisma Studio GUI |

---

## 🛠️ Running in Background

If you want the dev server to run in background:

```bash
# Start in background
nohup pnpm run dev > /tmp/inbox-zero-dev.log 2>&1 &

# View logs
tail -f /tmp/inbox-zero-dev.log

# Stop background process
pkill -f "next dev"
```

---

## 🔍 Check Status

### Check if Dev Server is Running

```bash
# Check port 3000
lsof -i :3000

# Or test with curl
curl http://localhost:3000
```

### Check Docker Services

```bash
# List running containers
docker ps

# Check specific services
docker ps --filter "name=inbox-zero"
```

### View Logs

```bash
# Dev server logs (if background)
tail -f /tmp/inbox-zero-dev.log

# PostgreSQL logs
docker-compose logs -f db

# Redis logs
docker-compose logs -f redis
```

---

## 🐛 Troubleshooting

### Port 3000 Already in Use

```bash
# Kill process using port 3000
lsof -ti :3000 | xargs kill -9

# Then restart
pnpm run dev
```

### Docker Services Won't Start

```bash
# Stop all services
docker-compose down

# Clean up
docker system prune -f

# Restart
docker-compose up -d db redis
```

### Database Connection Issues

```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# Restart PostgreSQL
docker-compose restart db

# Re-run migrations
cd apps/web
pnpm prisma migrate dev
```

### Redis Connection Issues

```bash
# Check if Redis is running
docker ps | grep redis

# Restart Redis
docker-compose restart redis
```

### Environment Variable Errors

If you see errors like:
```
Invalid environment variables: EMAIL_ENCRYPT_SECRET Required
```

1. Check `apps/web/.env` file exists
2. Verify all required variables are set
3. Restart the dev server

### Google Login Fails

Ensure these Google Cloud APIs are enabled:
- **Gmail API**: https://console.cloud.google.com/apis/library/gmail.googleapis.com
- **People API**: https://console.developers.google.com/apis/api/people.googleapis.com
- **Google Calendar API** (optional): https://console.cloud.google.com/apis/library/calendar-json.googleapis.com

### Clean Slate Reset

If everything is broken:

```bash
# 1. Stop everything
pkill -f "next dev"
docker-compose down

# 2. Clean Docker
docker system prune -f

# 3. Remove node_modules (optional)
rm -rf node_modules apps/web/node_modules

# 4. Fresh install
pnpm install

# 5. Reset database (⚠️ deletes all data)
cd apps/web
pnpm prisma migrate reset

# 6. Start fresh
cd ../..
docker-compose up -d db redis
pnpm run dev
```

---

## 🎯 Access Points

Once running, access these URLs:

- **Main App**: http://localhost:3000
- **Login**: http://localhost:3000/login
- **Admin Panel**: http://localhost:3000/admin (requires ADMINS env var)
- **API Health**: http://localhost:3000/api/user/me

---

## 👤 Make Yourself Admin

To access premium features:

1. Add your email to `apps/web/.env`:
   ```bash
   ADMINS=your-email@gmail.com
   ```

2. Restart the dev server

3. Visit: http://localhost:3000/admin

4. Click the upgrade button

---

## 📊 Service Ports

| Service | Port | URL |
|---------|------|-----|
| Next.js Dev | 3000 | http://localhost:3000 |
| PostgreSQL | 5432 | postgresql://localhost:5432 |
| Redis | 6380 | redis://localhost:6380 |

---

## 🔗 Useful Links

- **Documentation**: <your-docs-url>
- **Main README**: [README.md](README.md)
- **Architecture**: [ARCHITECTURE.md](ARCHITECTURE.md)
- **Contributing**: [AGENTS.md](AGENTS.md)

---

## 💡 Tips

1. **Leave Docker running** - No need to stop Docker services between sessions. They use minimal resources when idle.

2. **Hot reload** - Next.js dev server supports hot reload. Changes to most files will auto-refresh.

3. **Check logs first** - If something breaks, check logs:
   ```bash
   tail -f /tmp/inbox-zero-dev.log
   ```

4. **Database GUI** - Use Prisma Studio for easy database inspection:
   ```bash
   cd apps/web
   pnpm prisma studio
   # Opens at http://localhost:5555
   ```

5. **Environment changes** - If you change `.env` variables, restart the dev server.

---

## 🆘 Need Help?

- Check the main [README.md](README.md) for detailed setup
- View [ARCHITECTURE.md](ARCHITECTURE.md) to understand the codebase
- Join the community
- Open an [Issue](https://github.com/elie222/inbox-zero/issues) on GitHub

---

**Last Updated**: October 29, 2025
