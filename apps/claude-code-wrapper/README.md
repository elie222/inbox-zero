# Claude Code Wrapper

An HTTP wrapper service that exposes [Claude Code CLI](https://github.com/anthropics/claude-code) as a REST API. This enables programmatic access to Claude Code's capabilities from any application that can make HTTP requests.

## Overview

The Claude Code Wrapper provides:

- **REST API endpoints** for text generation, object extraction, and streaming
- **Session management** for multi-turn conversations
- **Health monitoring** with CLI availability checks
- **Extensible skills system** for domain-specific capabilities
- **Docker deployment** with hardened security configuration

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Your Application                                                       │
│  (Any HTTP client)                                                      │
└─────────────────────────────────────────────────────────────────────────┘
                            │
                            ▼ HTTP REST API
┌─────────────────────────────────────────────────────────────────────────┐
│  Claude Code Wrapper (this service)                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │ Core HTTP Server (Express)                                          ││
│  │ - /generate-text    → Text generation                               ││
│  │ - /generate-object  → Structured object extraction                  ││
│  │ - /stream           → Server-Sent Events streaming                  ││
│  │ - /health           → Health check with CLI status                  ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                           │                                             │
│                           ▼ Subprocess                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │ Claude Code CLI                                                     ││
│  │ + Skills (loaded from ~/.claude/skills/)                            ││
│  └─────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
claude-code-wrapper/
├── src/
│   ├── index.ts           # Express app setup, auth middleware
│   ├── cli.ts             # Claude CLI subprocess management
│   ├── types.ts           # Request/response type definitions
│   ├── logger.ts          # Logging utilities
│   └── routes/
│       ├── generate.ts    # /generate-text and /generate-object
│       ├── stream.ts      # /stream (SSE streaming)
│       └── health.ts      # /health endpoint
├── .claude/
│   └── skills/            # Claude skills (extensible)
│       └── inbox-zero-tools/
│           └── SKILL.md   # Email assistant skill (app-specific)
├── __tests__/             # Test suites
├── Dockerfile             # Hardened container build
└── package.json
```

## Core vs App-Specific Code

### Core Functionality (Reusable)

The following components are **generic** and can be used with any Claude Code deployment:

| File | Purpose |
|------|---------|
| `src/index.ts` | Express server, API key auth, middleware |
| `src/cli.ts` | Claude CLI subprocess management, timeout handling |
| `src/types.ts` | Request/response schemas and type definitions |
| `src/logger.ts` | Structured logging to stderr |
| `src/routes/generate.ts` | Text and object generation endpoints |
| `src/routes/stream.ts` | SSE streaming endpoint |
| `src/routes/health.ts` | Health check with CLI verification |

### App-Specific (Email Assistant)

The following are **coupled to the Inbox Zero email assistant** and should be replaced or removed for other deployments:

| File | Purpose |
|------|---------|
| `.claude/skills/inbox-zero-tools/SKILL.md` | Email rule management skill |
| Environment variables: `INBOX_ZERO_*`, `LLM_TOOL_PROXY_TOKEN` | Tool proxy integration |

## Skills System

Claude Code supports **skills** - markdown files that teach Claude how to use domain-specific tools. Skills are loaded from `~/.claude/skills/` (or wherever the Claude CLI config directory is located).

### Adding Custom Skills

1. Create a skill directory: `.claude/skills/your-skill-name/`
2. Add a `SKILL.md` file with:
   - YAML frontmatter (`name`, `description`, `allowed-tools`)
   - Instructions for Claude on when and how to use the skill
   - API documentation, examples, and best practices

Example skill structure:

```markdown
---
name: your-custom-skill
description: Brief description of what this skill does
allowed-tools: Bash, Read
---

# Your Custom Skill

Instructions for Claude on how to use this skill...

## Available Operations

### Operation 1
...curl examples, input/output schemas...
```

### Environment Variables for Skills

Skills can access environment variables passed to the Claude CLI. Add custom variables in `src/cli.ts`:

```typescript
export function buildClaudeEnv(options?: { userEmail?: string }): NodeJS.ProcessEnv {
  const env = { ...process.env };

  // Add your custom environment variables here
  if (process.env.YOUR_API_URL) {
    env.YOUR_API_URL = process.env.YOUR_API_URL;
  }

  return env;
}
```

## API Reference

### Authentication

All endpoints (except `/health`) require Bearer token authentication:

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" http://localhost:3100/generate-text
```

### `POST /generate-text`

Generate text from a prompt.

**Request:**
```json
{
  "prompt": "Explain quantum computing in simple terms",
  "system": "You are a helpful science teacher",
  "sessionId": "optional-session-id",
  "model": "sonnet",
  "maxTokens": 4096
}
```

**Response:**
```json
{
  "text": "Quantum computing is...",
  "usage": {
    "inputTokens": 25,
    "outputTokens": 150,
    "totalTokens": 175
  },
  "sessionId": "session-uuid"
}
```

### `POST /generate-object`

Extract structured data using a JSON schema.

**Request:**
```json
{
  "prompt": "Extract the person's name and age from: John is 30 years old",
  "schema": {
    "type": "object",
    "properties": {
      "name": { "type": "string" },
      "age": { "type": "number" }
    }
  }
}
```

**Response:**
```json
{
  "object": { "name": "John", "age": 30 },
  "rawText": "```json\n{\"name\": \"John\", \"age\": 30}\n```",
  "usage": { "inputTokens": 40, "outputTokens": 20, "totalTokens": 60 },
  "sessionId": "session-uuid"
}
```

### `POST /stream`

Stream responses via Server-Sent Events (SSE).

**Request:**
```json
{
  "prompt": "Write a short story about a robot",
  "system": "You are a creative writer"
}
```

**Response (SSE events):**
```
event: session
data: {"sessionId": "session-uuid"}

event: text
data: {"text": "Once upon"}

event: text
data: {"text": " a time..."}

event: result
data: {"sessionId": "session-uuid", "usage": {...}}

event: done
data: {"code": 0, "signal": null}
```

### `GET /health`

Health check endpoint (no authentication required).

**Response:**
```json
{
  "status": "healthy",
  "cli": {
    "available": true,
    "version": "1.0.34"
  }
}
```

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `API_KEY` | Bearer token for authenticating API requests |

### Claude Authentication (one required)

| Variable | Description |
|----------|-------------|
| `CLAUDE_CODE_OAUTH_TOKEN` | OAuth token (preferred for Claude Max subscribers) |
| `ANTHROPIC_API_KEY` | API key (used if OAuth token not present) |

### Optional - Core

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3100` | HTTP server port |

### Optional - Inbox Zero Integration

These variables enable the email assistant skill (remove for generic deployments):

| Variable | Description |
|----------|-------------|
| `INBOX_ZERO_API_URL` | Base URL of the Inbox Zero web app |
| `LLM_TOOL_PROXY_TOKEN` | Authentication token for tool proxy |

## Development

### Prerequisites

- Node.js >= 20 or Bun >= 1.1
- Claude Code CLI installed (`bun install -g @anthropic-ai/claude-code`)

### Setup

```bash
# Install dependencies
bun install

# Set required environment variables
export API_KEY=$(openssl rand -hex 32)
export ANTHROPIC_API_KEY=your-api-key

# Run in development mode (with hot reload)
bun run dev

# Run tests
bun run test

# Build for production
bun run build
bun run start
```

### Running Tests

```bash
# Unit tests
bun run test

# With coverage
bun run test:coverage

# E2E tests (requires real Claude CLI)
RUN_E2E_TESTS=true bun run test:e2e
```

## Docker Deployment

### Build

```bash
docker build -f apps/claude-code-wrapper/Dockerfile -t claude-code-wrapper .
```

### Run

```bash
docker run -d \
  -p 3100:3100 \
  -e API_KEY=your-api-key \
  -e ANTHROPIC_API_KEY=your-anthropic-key \
  claude-code-wrapper
```

### Security Features

The Dockerfile includes several hardening measures:

- Multi-stage build (smaller attack surface)
- Non-root user execution (`bun` user, UID 1000)
- Minimal base image (Bun slim ~100MB)
- Health check endpoint
- No shell access in production

## Extending for Other Applications

To adapt this wrapper for a different application:

1. **Remove app-specific skills:**
   ```bash
   rm -rf .claude/skills/inbox-zero-tools
   ```

2. **Remove app-specific environment handling** in `src/cli.ts`:
   - Remove `INBOX_ZERO_*` and `LLM_TOOL_PROXY_TOKEN` references

3. **Add your own skills** in `.claude/skills/your-app/SKILL.md`

4. **Update `buildClaudeEnv()`** to pass your app's environment variables

5. **Update the Dockerfile** to copy your skills directory

## Error Codes

| Code | Description |
|------|-------------|
| `VALIDATION_ERROR` | Invalid request body or parameters |
| `INTERNAL_ERROR` | Server-side error |
| `TIMEOUT_ERROR` | CLI execution timed out |
| `CLI_EXIT_ERROR` | CLI exited with non-zero code |
| `SPAWN_ERROR` | Failed to spawn CLI process |
| `PARSE_ERROR` | Failed to parse CLI output |

## License

MIT

## Contributing

Contributions welcome! Please open an issue or PR.
