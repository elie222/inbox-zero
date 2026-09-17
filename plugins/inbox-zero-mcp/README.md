# Inbox Zero MCP plugin (skeleton)

Agent Plugin that points Cursor at the hosted Inbox Zero MCP server.

This is not listed on the Cursor Marketplace yet. The live MCP URL is the prerequisite; listing this plugin comes after the hosted `MCP_SERVER_ENABLED` flag is on.

## Local install

Copy or symlink this directory to `~/.cursor/plugins/local/inbox-zero-mcp`, then reload Cursor.

Or connect without the plugin by adding `mcp.json` from this folder into `~/.cursor/mcp.json`.

## Files

- `plugin.json` — Agent Plugins manifest
- `mcp.json` — remote Streamable HTTP MCP at `https://www.getinboxzero.com/mcp`
- `skills/inbox-zero-mcp/SKILL.md` — how to search, read, and draft without sending

OAuth uses dynamic client registration. Replace the URL for self-hosted deployments.
