# Environment Variables Reference

This document provides a comprehensive reference for all environment variables relevant to self-hosting Inbox Zero.

## Quick Start

```bash
cp apps/web/.env.example apps/web/.env
```

## All Environment Variables

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| **Core** ||||
| `DATABASE_URL` | Yes | PostgreSQL connection string | — |
| `NEXT_PUBLIC_BASE_URL` | Yes | Public URL where app is hosted (e.g., `https://yourdomain.com`) | — |
| `INTERNAL_API_KEY` | Yes | Secret key for internal API calls. Generate with `openssl rand -hex 32` | — |
| `AUTH_SECRET` | Yes | better-auth secret. Generate with `openssl rand -hex 32` | — |
| `NODE_ENV` | No | Environment mode | `development` |
| **Encryption** ||||
| `EMAIL_ENCRYPT_SECRET` | Yes | Secret for encrypting OAuth tokens. Generate with `openssl rand -hex 32` | — |
| `EMAIL_ENCRYPT_SALT` | Yes | Salt for encrypting OAuth tokens. Generate with `openssl rand -hex 16` | — |
| **Google OAuth** ||||
| `GOOGLE_CLIENT_ID` | Yes | OAuth client ID from Google Cloud Console | — |
| `GOOGLE_CLIENT_SECRET` | Yes | OAuth client secret from Google Cloud Console | — |
| **Microsoft OAuth** ||||
| `MICROSOFT_CLIENT_ID` | No | OAuth client ID from Azure Portal | — |
| `MICROSOFT_CLIENT_SECRET` | No | OAuth client secret from Azure Portal | — |
| `MICROSOFT_WEBHOOK_CLIENT_STATE` | No | Secret for Microsoft webhook verification. Generate with `openssl rand -hex 32` | — |
| **Google PubSub** ||||
| `GOOGLE_PUBSUB_TOPIC_NAME` | Yes | Full topic name (e.g., `projects/my-project/topics/gmail`) | — |
| `GOOGLE_PUBSUB_VERIFICATION_TOKEN` | No | Token for webhook verification | — |
| **Redis** ||||
| `UPSTASH_REDIS_URL` | No* | Upstash Redis URL (*required if not using Docker Compose with local Redis) | — |
| `UPSTASH_REDIS_TOKEN` | No* | Upstash Redis token (*required if not using Docker Compose) | — |
| `REDIS_URL` | No | Alternative Redis URL (for subscriptions) | — |
| **LLM Provider Selection** ||||
| `DEFAULT_LLM_PROVIDER` | No | Primary LLM provider (`anthropic`, `google`, `openai`, `bedrock`, `openrouter`, `groq`, `aigateway`, `ollama`) | `anthropic` |
| `DEFAULT_LLM_MODEL` | No | Model to use with default provider | Provider default |
| `DEFAULT_OPENROUTER_PROVIDERS` | No | Comma-separated list of OpenRouter providers | — |
| `ECONOMY_LLM_PROVIDER` | No | Provider for cheaper operations | — |
| `ECONOMY_LLM_MODEL` | No | Model for economy provider | — |
| `ECONOMY_OPENROUTER_PROVIDERS` | No | OpenRouter providers for economy model | — |
| `CHAT_LLM_PROVIDER` | No | Provider for chat operations | Falls back to default |
| `CHAT_LLM_MODEL` | No | Model for chat provider | — |
| `CHAT_OPENROUTER_PROVIDERS` | No | OpenRouter providers for chat | — |
| `OPENROUTER_BACKUP_MODEL` | No | Fallback model for OpenRouter | `google/gemini-2.5-flash` |
| `USE_BACKUP_MODEL` | No | Enable backup model fallback | `false` |
| **LLM API Keys** ||||
| `ANTHROPIC_API_KEY` | No | Anthropic API key | — |
| `OPENAI_API_KEY` | No | OpenAI API key | — |
| `GOOGLE_API_KEY` | No | Google Gemini API key | — |
| `GROQ_API_KEY` | No | Groq API key | — |
| `OPENROUTER_API_KEY` | No | OpenRouter API key | — |
| `AI_GATEWAY_API_KEY` | No | AI Gateway API key | — |
| **AWS Bedrock** ||||
| `BEDROCK_ACCESS_KEY` | No | AWS access key for Bedrock. See [AI SDK Bedrock documentation](https://ai-sdk.dev/providers/ai-sdk-providers/amazon-bedrock). | — |
| `BEDROCK_SECRET_KEY` | No | AWS secret key for Bedrock | — |
| `BEDROCK_REGION` | No | AWS region for Bedrock | `us-west-2` |
| **Ollama (Local LLM)** ||||
| `OLLAMA_BASE_URL` | No | Ollama API endpoint (e.g., `http://localhost:11434/api`) | — |
| `NEXT_PUBLIC_OLLAMA_MODEL` | No | Model to use with Ollama | — |
| **Background Jobs (QStash)** ||||
| `QSTASH_TOKEN` | No | QStash API token | — |
| `QSTASH_CURRENT_SIGNING_KEY` | No | Current signing key for webhooks | — |
| `QSTASH_NEXT_SIGNING_KEY` | No | Next signing key for key rotation | — |
| **Sentry** ||||
| `SENTRY_AUTH_TOKEN` | No | Auth token for source maps | — |
| `SENTRY_ORGANIZATION` | No | Organization slug | — |
| `SENTRY_PROJECT` | No | Project slug | — |
| `NEXT_PUBLIC_SENTRY_DSN` | No | Client-side DSN | — |
| **Resend** ||||
| `RESEND_API_KEY` | No | API key for transactional emails | — |
| `RESEND_AUDIENCE_ID` | No | Audience ID for contacts | — |
| `RESEND_FROM_EMAIL` | No | From email address | `Inbox Zero <updates@transactional.getinboxzero.com>` |
| **Other** ||||
| `CRON_SECRET` | No | Secret for cron job authentication | — |
| `HEALTH_API_KEY` | No | API key for health checks | — |
| `WEBHOOK_URL` | No | External webhook URL | — |
| **Admin & Access Control** ||||
| `ADMINS` | No | Comma-separated list of admin emails | — |
| **Feature Flags** ||||
| `NEXT_PUBLIC_CONTACTS_ENABLED` | No | Enable contacts feature | `false` |
| `NEXT_PUBLIC_EMAIL_SEND_ENABLED` | No | Enable email sending | `true` |
| `NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS` | No | Bypass premium checks (recommended for self-hosting) | `true` |
| **Debugging** ||||
| `LOG_ZOD_ERRORS` | No | Log Zod validation errors | — |
| `ENABLE_DEBUG_LOGS` | No | Enable debug logging | `false` |
| `NEXT_PUBLIC_LOG_SCOPES` | No | Comma-separated log scopes | — |

## Setup Guides

For detailed setup instructions:

- **Google OAuth**: See [README - Google OAuth Setup](../../README.md#google-oauth-setup)
- **Microsoft OAuth**: See [README - Microsoft OAuth Setup](../../README.md#microsoft-oauth-setup)
- **Google PubSub**: See [README - PubSub Setup](../../README.md#google-pubsub-setup)
- **LLM Configuration**: See [README - LLM Setup](../../README.md#llm-setup)

## Notes

- If running the app in Docker and Ollama locally, use `http://host.docker.internal:11434/api` as the `OLLAMA_BASE_URL`.
- When using Docker Compose with `--profile all`, database and Redis URLs are auto-configured. See the [Self-Hosting Guide](./self-hosting.md) for details.
