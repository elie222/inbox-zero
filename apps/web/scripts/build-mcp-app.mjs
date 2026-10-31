import { existsSync } from "node:fs";

// Builds the optional MCP mail client UI when its source is installed.
const builder = new URL("../mcp-app/build.mjs", import.meta.url);
if (existsSync(builder)) await import(builder.href);
