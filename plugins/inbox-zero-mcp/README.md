# Inbox Zero MCP plugin

Cursor plugin that connects to an Inbox Zero MCP server.

## Install

Copy or symlink this directory to `~/.cursor/plugins/local/inbox-zero-mcp`, then reload Cursor.

Set the URL in `mcp.json` to your Inbox Zero origin, for example `https://www.getinboxzero.com/mcp` or `https://your-inbox-zero-host/mcp`.

Or connect without the plugin by adding that `mcp.json` into `~/.cursor/mcp.json`.

## Files

- `plugin.json` — Agent Plugins manifest
- `mcp.json` — remote Streamable HTTP MCP URL
- `skills/inbox-zero-mcp/SKILL.md` — how to search, read, and draft without sending

OAuth uses dynamic client registration.
