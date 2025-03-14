# Inbox Zero MCP Server

An MCP server to manage your inbox efficiently. Use it within Cursor, Windsurf, or Claude desktop to interact with your Inbox Zero personal assistant.

## Run it locally

From this directory:

```
pnpm run build
pnpm start
```

Then use the MCP at path `apps/mcp-server/build/index.js` in Cursor or Claude Desktop. Note, use the full path.

ATM, you should replace the empty string with your API key (PRs welcome to improve this). You can get your API key from the `/settings` page in the web app:

```js
const API_KEY = process.env.API_KEY || "";
```
