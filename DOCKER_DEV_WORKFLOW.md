# Docker + Local Development Workflow

This setup allows you to run Redis, PostgreSQL, and other services in Docker Compose while running the web app locally in your terminal for fast development iteration.

## 🚀 Quick Start

### Option 1: Docker-based Development (Recommended)

```bash
cd apps/web
./scripts/dev-docker.sh setup
```

This will:
- Create `.env.local` from template
- Start Docker services (PostgreSQL, Redis)
- Set up the database with migrations
- Show you what to configure

Then edit `.env.local` with your API keys and run:

```bash
./scripts/dev-docker.sh start
```

### Option 2: Traditional Local Development

```bash
cd apps/web
./scripts/dev.sh setup
```

This uses local PostgreSQL installation instead of Docker.

## 🐳 Docker Services

The Docker services run independently and provide:

- **PostgreSQL**: `localhost:5432` (database: `inboxzero`)
- **Redis**: `localhost:6379`
- **Redis HTTP**: `localhost:8079` (for Upstash compatibility)

## 📋 Available Commands

### Docker-based Development (`dev-docker.sh`)

```bash
# Complete setup (first time)
./scripts/dev-docker.sh setup

# Start everything (Docker services + web app)
./scripts/dev-docker.sh start

# Start only Docker services
./scripts/dev-docker.sh services start

# Start only web app (assumes services are running)
./scripts/dev-docker.sh web

# Check status
./scripts/dev-docker.sh status

# View Docker logs
./scripts/dev-docker.sh logs

# Stop Docker services
./scripts/dev-docker.sh services stop

# Clean up everything
./scripts/dev-docker.sh cleanup
```

### Traditional Development (`dev.sh`)

```bash
# Setup (requires local PostgreSQL)
./scripts/dev.sh setup

# Start web app
./scripts/dev.sh start

# Check status
./scripts/dev.sh status
```

## 🔧 Configuration

### Environment Files

- `.env.local` - Local development configuration
- `env.local.template` - Template for local setup

### Key Settings in `.env.local`

```bash
# Database - connects to Docker services
DATABASE_URL="postgresql://postgres:password@localhost:5432/inboxzero"

# Redis - connects to Docker services  
UPSTASH_REDIS_URL="http://localhost:8079"
REDIS_URL="redis://localhost:6379"

# Your API keys
ANTHROPIC_API_KEY="your-key"
OPENAI_API_KEY="your-key"

# Admin access
ADMINS="your-email@example.com"
```

## 🎯 Development Workflow

### Recommended Workflow

1. **Start Docker services** (in one terminal):
   ```bash
   ./scripts/dev-docker.sh services start
   ```

2. **Start web app** (in another terminal):
   ```bash
   ./scripts/dev-docker.sh web
   ```

3. **View logs** (optional, in third terminal):
   ```bash
   ./scripts/dev-docker.sh logs
   ```

### Alternative: All-in-One

```bash
./scripts/dev-docker.sh start
```

This starts Docker services and web app together.

## 🛠️ Troubleshooting

### Docker Services Not Starting

```bash
# Check Docker is running
docker info

# Check service status
./scripts/dev-docker.sh services status

# View logs
./scripts/dev-docker.sh logs
```

### Database Connection Issues

```bash
# Test PostgreSQL connection
docker exec inbox-zero-dev-db pg_isready -U postgres -d inboxzero

# Test Redis connection
docker exec inbox-zero-dev-redis redis-cli ping
```

### Reset Everything

```bash
# Stop services and remove data
./scripts/dev-docker.sh cleanup --volumes

# Start fresh
./scripts/dev-docker.sh setup
```

## 📁 File Structure

```
inbox-zero/
├── docker-compose.dev.yml          # Docker services for development
├── docker-compose.yml             # Full production setup
└── apps/web/
    ├── .env.local                 # Local development config
    ├── env.local.template         # Template for local setup
    └── scripts/
        ├── dev-docker.sh         # Docker-based development
        └── dev.sh                # Traditional development
```

## 🎉 Benefits

✅ **Fast Development**: Web app runs locally with hot reload  
✅ **Consistent Services**: Redis/DB versions match production  
✅ **Easy Setup**: One command to start everything  
✅ **Isolated Environment**: Separate from production data  
✅ **Flexible**: Can run services separately or together  
✅ **Clean Shutdown**: Easy cleanup when done  

## 🔄 Switching Between Setups

- **Docker-based**: Use `dev-docker.sh` commands
- **Traditional**: Use `dev.sh` commands
- **Production**: Use `docker-compose.yml`

Both setups use the same `.env.local` file, so you can switch between them easily.
