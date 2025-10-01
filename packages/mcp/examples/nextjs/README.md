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
