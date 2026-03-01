# Replay Test Fixtures

Replay tests verify the email processing and chat pipelines handle real interactions correctly by recording production/staging interactions and replaying them in fast, deterministic unit tests.

## Quick Start

### 1. Enable recording locally

```bash
# In .env.local
REPLAY_RECORDING_ENABLED=true
```

### 2. Trigger the interaction you want to capture

- Send a test email to trigger webhook processing
- Use the assistant chat to trigger a chat flow

### 3. Find and export your recording

```bash
pnpm replay:list                    # List all sessions
pnpm replay:export <session-id>     # Export raw JSON
pnpm replay:convert <session-id>    # Convert to fixture (strips PII)
```

### 4. Save as fixture

```bash
pnpm replay:convert <session-id> apps/web/__tests__/fixtures/replay/webhook/my-scenario.json
```

### 5. Write a replay test

See `apps/web/__tests__/replay/` for examples of how to use `createReplayTestContext()`.

## Fixture Format

```json
{
  "metadata": {
    "description": "Human-readable description of what this test covers",
    "flow": "webhook" | "chat",
    "recordedAt": "ISO timestamp",
    "commitSha": "optional git SHA"
  },
  "setup": {
    "emailAccount": {},
    "rules": []
  },
  "entries": [
    { "type": "webhook", "sequence": 0, "platform": "google", "request": { ... } },
    { "type": "email-api-call", "sequence": 1, "method": "getMessage", "request": { ... } },
    { "type": "email-api-response", "sequence": 2, "method": "getMessage", "response": { ... } },
    { "type": "llm-request", "sequence": 3, "label": "choose-rule", "request": { ... } },
    { "type": "llm-response", "sequence": 4, "label": "choose-rule", "response": { ... } }
  ]
}
```

## Directory Structure

```
fixtures/replay/
├── webhook/          # Webhook email processing flows
│   ├── label-and-archive.json
│   └── draft-reply.json
└── chat/             # Assistant chat flows
    ├── search-and-summarize.json
    └── draft-reply-flow.json
```

## Entry Types

| Type | Description |
|------|-------------|
| `webhook` | Incoming webhook payload (Google PubSub or Outlook notification) |
| `email-api-call` | Call to email provider method (getMessage, labelMessage, etc.) |
| `email-api-response` | Response from email provider |
| `llm-request` | LLM call (system prompt, user prompt, tools) |
| `llm-response` | LLM response (generated object, text, tool calls) |
| `chat-message` | User chat message input |
| `chat-step` | One step of multi-step chat (tool call + result) |
