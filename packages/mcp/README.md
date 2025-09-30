# @inboxzero/mcp

**OAuth 2.1 utilities for MCP (Model Context Protocol) integrations with PKCE and dynamic client registration.**

This package solves the hardest parts of connecting to MCP servers: OAuth 2.1 with PKCE and dynamic client registration (RFC7591). Use it alongside the official `@modelcontextprotocol/sdk` for a complete solution.

## The Problem We Solve

Many MCP servers support OAuth with dynamic client registration, but:
1. **Dynamic client registration is poorly documented** - RFC7591 is complex and MCP-specific requirements aren't well explained
2. **PKCE implementation is error-prone** - Getting OAuth 2.1 PKCE right is tricky
3. **Token management is tedious** - Refreshing tokens, handling expiration, etc.

This package handles all of that, so you can focus on using MCP tools.

## What This Package Does (and Doesn't Do)

✅ **What we provide:**
- OAuth 2.1 with PKCE flow
- Dynamic client registration (RFC7591) - no need to manually register OAuth apps
- Token refresh handling
- Helper functions to get properly authenticated headers

❌ **What we don't provide:**
- MCP Client (use `@modelcontextprotocol/sdk` directly)
- Storage implementation (you bring your own database)
- Logger implementation (optional - works without one)

We're focused on making OAuth painless, not wrapping the entire MCP SDK.

## Installation

```bash
npm install @inboxzero/mcp @modelcontextprotocol/sdk
```

## Quick Start

### 1. Define Your Integration

```typescript
import type { McpIntegrationConfig } from '@inboxzero/mcp';

const notion: McpIntegrationConfig = {
  name: 'notion',
  displayName: 'Notion',
  serverUrl: 'https://mcp.notion.com/mcp',
  authType: 'oauth',
  defaultScopes: ['read'],
  oauthConfig: {
    authorization_endpoint: 'https://mcp.notion.com/authorize',
    token_endpoint: 'https://mcp.notion.com/token',
    registration_endpoint: 'https://mcp.notion.com/register', // ✨ Magic happens here
  },
};
```

### 2. Implement Storage Interface

```typescript
import type { CredentialStorage } from '@inboxzero/mcp';

const storage: CredentialStorage = {
  // Client credentials (shared across users)
  async getClientCredentials(integration) {
    return await db.clientCreds.findOne({ integration });
  },
  async storeClientCredentials(integration, creds) {
    await db.clientCreds.save({ integration, ...creds });
  },
  
  // User-specific credentials (tokens)
  async getConnectionCredentials(integration, userId) {
    return await db.connections.findOne({ integration, userId });
  },
  async storeConnectionCredentials(integration, userId, creds) {
    await db.connections.save({ integration, userId, ...creds });
  },
  async updateConnectionCredentials(integration, userId, creds) {
    await db.connections.update({ integration, userId }, creds);
  },
};
```

### 3. OAuth Flow (One Time Per User)

```typescript
import {
  generateAuthorizationUrl,
  exchangeCodeForTokens,
} from '@inboxzero/mcp';

// Generate auth URL
const { url, codeVerifier } = await generateAuthorizationUrl(
  notion,
  'https://yourapp.com/callback',
  'random-state',
  storage
);

// Redirect user to `url`
// Store `codeVerifier` in session/cookie

// After user authorizes and returns to callback:
const tokens = await exchangeCodeForTokens(
  notion,
  code, // from query params
  codeVerifier, // from session
  'https://yourapp.com/callback',
  storage
);

// Store tokens
await storage.storeConnectionCredentials('notion', userId, {
  accessToken: tokens.access_token,
  refreshToken: tokens.refresh_token,
  expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
});
```

### 4. Use MCP Client (Every Time)

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createMcpHeaders } from '@inboxzero/mcp';

// Get authenticated headers (handles token refresh automatically)
const headers = await createMcpHeaders(
  notion,
  userId,
  storage
);

// Use official MCP SDK
const transport = new StreamableHTTPClientTransport(
  new URL(notion.serverUrl),
  { requestInit: { headers } }
);

const client = new Client({
  name: 'my-app',
  version: '1.0.0',
});

await client.connect(transport);

// Use MCP client as normal
const tools = await client.listTools();
const result = await client.callTool({
  name: 'notion-search',
  arguments: { query: 'meeting notes' }
});

await client.close();
```

## That's It!

Three simple steps:
1. **OAuth flow** (once per user) - We handle dynamic registration automatically
2. **Get headers** - We handle token refresh automatically  
3. **Use MCP SDK** - Use the official SDK normally

**Note:** Logger is optional everywhere - omit it or pass `console`, your custom logger, or anything that implements the `Logger` interface.

## Why Dynamic Client Registration Matters

Traditional OAuth requires pre-registering an OAuth app with each provider:
```
❌ Manual: Register app with Notion → Get client ID/secret → Configure env vars
❌ Manual: Register app with Stripe → Get client ID/secret → Configure env vars  
❌ Manual: Register app with HubSpot → ...
```

With dynamic registration:
```
✅ Automatic: Package registers OAuth client on first use
✅ Automatic: Credentials stored and reused
✅ Automatic: Works for any MCP server that supports RFC7591
```

## Advanced Usage

### Using Pre-registered OAuth Clients

If you prefer static credentials (or the provider doesn't support dynamic registration):

```typescript
const { url, codeVerifier } = await generateAuthorizationUrl(
  integration,
  redirectUri,
  state,
  storage,
  logger,
  {
    clientId: process.env.NOTION_CLIENT_ID,
    clientSecret: process.env.NOTION_CLIENT_SECRET,
  }
);
```

Static credentials take precedence over dynamic registration.

### Manual Token Refresh

```typescript
import { refreshAccessToken } from '@inboxzero/mcp';

const newTokens = await refreshAccessToken(
  integration,
  refreshToken,
  storage,
  logger
);
```

### Just Get a Bearer Token

```typescript
import { getBearerToken } from '@inboxzero/mcp';

// Automatically refreshes if expired (logger optional)
const token = await getBearerToken(
  integration,
  userId,
  storage,
  console, // Optional: pass your logger or omit
  { autoRefresh: true }
);

// Use however you want
const response = await fetch('https://api.example.com/data', {
  headers: { Authorization: `Bearer ${token}` }
});
```

## API Reference

### Types

#### `McpIntegrationConfig`
```typescript
type McpIntegrationConfig = {
  name: string;
  displayName: string;
  serverUrl?: string;
  authType: 'oauth' | 'api-token';
  defaultScopes: string[];
  oauthConfig?: {
    authorization_endpoint: string;
    token_endpoint: string;
    registration_endpoint?: string; // For dynamic registration
  };
};
```

#### `CredentialStorage`
```typescript
interface CredentialStorage {
  // Client credentials (shared across users, from dynamic registration)
  getClientCredentials(integration: string): Promise<ClientCredentials | null>;
  storeClientCredentials(integration: string, credentials: ClientCredentials): Promise<void>;
  
  // User credentials (per-user tokens)
  getConnectionCredentials(integration: string, userId: string): Promise<ConnectionCredentials | null>;
  storeConnectionCredentials(integration: string, userId: string, credentials: ConnectionCredentials): Promise<void>;
  updateConnectionCredentials(integration: string, userId: string, credentials: Partial<ConnectionCredentials>): Promise<void>;
}
```

#### `Logger` (Optional)
```typescript
interface Logger {
  trace?(message: string, meta?: Record<string, unknown>): void;
  debug?(message: string, meta?: Record<string, unknown>): void;
  info?(message: string, meta?: Record<string, unknown>): void;
  warn?(message: string, meta?: Record<string, unknown>): void;
  error?(message: string, meta?: Record<string, unknown>): void;
  log?(message: string, meta?: Record<string, unknown>): void;
}
```

All methods are optional - provide only what your logger supports. Works with `console`, custom loggers, or omit entirely.

### Functions

#### OAuth Flow
- `generateAuthorizationUrl()` - Generate OAuth URL with PKCE
- `exchangeCodeForTokens()` - Exchange auth code for tokens
- `refreshAccessToken()` - Refresh an expired token

#### Helpers
- `createMcpHeaders()` - Get headers for MCP transport (handles refresh)
- `getBearerToken()` - Get just the bearer token (handles refresh)

#### PKCE Utilities
- `generatePKCEPair()` - Generate verifier and challenge
- `generateCodeVerifier()` - Just the verifier
- `generateCodeChallenge()` - Just the challenge from a verifier

## Tested MCP Servers

We've successfully used this with:

- **Notion** - `https://mcp.notion.com/mcp`
- **Stripe** - `https://mcp.stripe.com`  

All using dynamic client registration!

## Example Integrations

See the [integrations example](./examples/integrations.ts) for complete configuration examples.

## Why Not Wrap the MCP Client?

We initially wrapped the MCP SDK but realized:
1. The SDK is already great - no need to reinvent it
2. Wrapping it adds abstraction that gets in the way
3. People want to use the official SDK directly

So we focused on what's actually hard: OAuth with dynamic registration.

## Contributing

PRs welcome! This package is designed to be minimal and focused.

## License

MIT

## Credits

Built by the Inbox Zero team. We've integrated with dozens of MCP servers and learned what's hard. This package captures those learnings.