# @inbox-zero/cli

CLI tool for running [Inbox Zero](https://www.getinboxzero.com) - an open-source AI email assistant.

## Installation

### Homebrew (macOS/Linux)

```bash
brew install inbox-zero/inbox-zero/inbox-zero
```

### Manual Installation

Download the binary for your platform from [releases](https://github.com/elie222/inbox-zero/releases) and add to your PATH.

## Quick Start

```bash
# Configure Inbox Zero (interactive)
inbox-zero setup

# Start Inbox Zero
inbox-zero start

# Open http://localhost:3000
```

## Commands

### `inbox-zero setup`

Interactive setup wizard that:
- Configures OAuth providers (Google/Microsoft)
- Sets up your LLM provider and API key
- Configures ports (to avoid conflicts)
- Generates all required secrets

Configuration is stored in `~/.inbox-zero/`

### `inbox-zero start`

Pulls the latest Docker image and starts all containers:
- PostgreSQL database
- Redis cache
- Inbox Zero web app
- Cron job for email sync

```bash
inbox-zero start           # Start in background
inbox-zero start --no-detach  # Start in foreground
```

### `inbox-zero stop`

Stops all running containers.

```bash
inbox-zero stop
```

### `inbox-zero logs`

View container logs.

```bash
inbox-zero logs            # Show last 100 lines
inbox-zero logs -f         # Follow logs
inbox-zero logs -n 500     # Show last 500 lines
```

### `inbox-zero status`

Show status of running containers.

### `inbox-zero update`

Pull the latest Inbox Zero image and optionally restart.

```bash
inbox-zero update
```

## Requirements

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- OAuth credentials from Google and/or Microsoft
- An LLM API key (Anthropic, OpenAI, Google, etc.)

## Configuration

All configuration is stored in `~/.inbox-zero/`:
- `.env` - Environment variables
- `docker-compose.yml` - Docker Compose configuration

To reconfigure, run `inbox-zero setup` again.

## License

See [LICENSE](../../LICENSE) in the repository root.
