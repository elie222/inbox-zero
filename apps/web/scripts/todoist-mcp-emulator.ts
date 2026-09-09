// Standalone Todoist MCP emulator for local dev/QA.
//
// Usage:
//   npx tsx scripts/todoist-mcp-emulator.ts [port]
//
// Then point the app at it in apps/web/.env:
//   MCP_SERVER_URL_OVERRIDES={"todoist":"http://localhost:4310/mcp"}
// and seed an active Todoist McpConnection (any accessToken works; the
// emulator ignores auth).

import { createTodoistMcpEmulator } from "../__tests__/emulators/todoist-mcp";

const port = Number(process.argv[2]) || 4310;

createTodoistMcpEmulator({ port }).then((emulator) => {
  console.log(`Todoist MCP emulator listening at ${emulator.url}`);
  console.log(
    `Set MCP_SERVER_URL_OVERRIDES={"todoist":"${emulator.url}"} in apps/web/.env`,
  );

  setInterval(() => {
    if (emulator.addedTasks.length > 0) {
      console.log(
        `Tasks received so far: ${JSON.stringify(emulator.addedTasks, null, 2)}`,
      );
      emulator.addedTasks.length = 0;
    }
  }, 2000);
});
