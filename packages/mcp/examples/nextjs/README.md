# Next.js Integration Examples

Complete examples for integrating `@inboxzero/mcp` with Next.js App Router.

## Setup

### 1. Install Dependencies

```bash
pnpm add @inboxzero/mcp @modelcontextprotocol/sdk
```

### 2. Create Storage Implementation

See `storage.example.ts` for a Prisma-based implementation.

### 3. Add Route Handlers

Create these routes in your Next.js app:
- `app/api/mcp/[integration]/auth-url/route.ts`
- `app/api/mcp/[integration]/callback/route.ts`

## Route Flow

```
1. User clicks "Connect Notion"
   ↓
2. Frontend calls GET /api/mcp/notion/auth-url
   ↓
3. Route generates auth URL, stores state & PKCE verifier in cookies
   ↓
4. Frontend redirects user to auth URL
   ↓
5. User authorizes on Notion's site
   ↓
6. Notion redirects to GET /api/mcp/notion/callback?code=...&state=...
   ↓
7. Route validates, exchanges code for tokens, stores in DB
   ↓
8. User redirected back to your app (connected!)
```

## Files

- **auth-url-route.ts** - Generate OAuth authorization URL
- **callback-route.ts** - Handle OAuth callback and token exchange
- **storage.example.ts** - Prisma storage implementation
- **integrations.ts** - Integration configurations

## Environment Variables

```env
# Optional: Pre-registered OAuth clients (falls back to dynamic registration)
NOTION_MCP_CLIENT_ID=
NOTION_MCP_CLIENT_SECRET=

STRIPE_MCP_CLIENT_ID=
STRIPE_MCP_CLIENT_SECRET=

# Your app's base URL
NEXT_PUBLIC_BASE_URL=https://yourapp.com
```

## Usage in Frontend

```typescript
// Connect button
async function handleConnect() {
  const response = await fetch(`/api/mcp/notion/auth-url`);
  const { url } = await response.json();
  
  // Redirect to OAuth URL
  window.location.href = url;
}
```

## Security Notes

1. **State parameter** - Prevents CSRF attacks
2. **PKCE** - Secures public clients (no client secret needed)
3. **HttpOnly cookies** - State and verifier not accessible via JavaScript
4. **Short expiry** - Cookies expire in 10 minutes
5. **User validation** - Verify the user owns the email account before storing tokens
