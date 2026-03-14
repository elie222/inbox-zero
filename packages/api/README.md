# @inbox-zero/api

CLI tool for managing [Inbox Zero](https://www.getinboxzero.com) through the external API.

This package is separate from `@inbox-zero/cli`, which is focused on self-hosting and deployment.

## Installation

### `npx`

```bash
npx @inbox-zero/api --help
```

### Global install

```bash
npm install -g @inbox-zero/api
```

## Quick Start

```bash
inbox-zero-api config set base-url https://www.getinboxzero.com
inbox-zero-api config set api-key iz_your_api_key

inbox-zero-api rules list
inbox-zero-api stats by-period --period week
```

## Configuration

Configuration is loaded in this order:

1. Command flags
2. Environment variables
3. `~/.inbox-zero-api/config.json`

Supported environment variables:

- `INBOX_ZERO_BASE_URL`
- `INBOX_ZERO_API_KEY`

## Commands

### `inbox-zero-api config`

Manage local API CLI configuration.

```bash
inbox-zero-api config list
inbox-zero-api config get base-url
inbox-zero-api config set api-key iz_your_api_key
```

### `inbox-zero-api openapi`

Fetch the live OpenAPI document from the configured Inbox Zero deployment.

```bash
inbox-zero-api openapi --json
```

### `inbox-zero-api rules`

Manage automation rules for the inbox account scoped by the API key.

```bash
inbox-zero-api rules list
inbox-zero-api rules get rule_123
inbox-zero-api rules delete rule_123
```

Create or update rules with a JSON file or stdin:

```bash
inbox-zero-api rules create --file rule.json
cat rule.json | inbox-zero-api rules update rule_123 --file -
```

The request body must match the public API schema.

### `inbox-zero-api stats`

Read analytics from the external API.

```bash
inbox-zero-api stats by-period --period month
inbox-zero-api stats response-time --email me@example.com --json
```

For bot workflows, prefer `--json` so the CLI returns structured output instead of a human-oriented summary.

## License

See [LICENSE](../../LICENSE) in the repository root.
