# Inbox Zero MCP plugin (skeleton)

Agent Plugin that points Cursor at an Inbox Zero MCP server.

This is not listed on the Cursor Marketplace yet. Do not connect to production hosted MCP until `MCP_SERVER_ENABLED` and `NEXT_PUBLIC_EXTERNAL_API_ENABLED` are on. Enable those on a testing or self-hosted deployment first.

## Local install

Copy or symlink this directory to `~/.cursor/plugins/local/inbox-zero-mcp`, then reload Cursor.

Replace the URL in `mcp.json` with your testing or self-hosted origin (`https://your-inbox-zero-host/mcp`).

Or connect without the plugin by adding that `mcp.json` into `~/.cursor/mcp.json`.

## Files

- `plugin.json` — Agent Plugins manifest
- `mcp.json` — remote Streamable HTTP MCP URL (replace with your deployment)
- `skills/inbox-zero-mcp/SKILL.md` — how to search, read, and draft without sending

OAuth uses dynamic client registration.
