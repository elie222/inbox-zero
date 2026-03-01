// Run with: `npx dotenv -e .env.local -- tsx scripts/replay/export-session.ts <session-id>`
// Or: `pnpm replay:export <session-id>`

import "dotenv/config";
import { exportSession } from "@/utils/replay/recorder";

async function main() {
  const sessionId = process.argv[2];

  if (!sessionId) {
    console.error("Usage: pnpm replay:export <session-id>");
    console.error("  Use `pnpm replay:list` to find session IDs.");
    process.exit(1);
  }

  const session = await exportSession(sessionId);

  if (!session) {
    console.error(`Session not found: ${sessionId}`);
    console.error("  Sessions expire after 24 hours.");
    process.exit(1);
  }

  // Output clean JSON to stdout (pipe-friendly)
  console.log(JSON.stringify(session, null, 2));
}

main().catch(console.error);
