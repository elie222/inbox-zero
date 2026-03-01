// Run with: `npx dotenv -e .env.local -- tsx scripts/replay/list-sessions.ts`
// Or: `pnpm replay:list`

import "dotenv/config";
import { listSessions } from "@/utils/replay/recorder";

async function main() {
  const sha = process.argv[2];

  const sessions = await listSessions();

  if (sessions.length === 0) {
    console.log("No recording sessions found.");
    return;
  }

  const filtered = sha ? sessions.filter((s) => s.id.includes(sha)) : sessions;

  if (filtered.length === 0) {
    console.log(`No sessions found matching SHA: ${sha}`);
    console.log(`Total sessions available: ${sessions.length}`);
    return;
  }

  console.log(`Found ${filtered.length} session(s):\n`);

  for (const session of filtered) {
    const age = getAge(session.metadata.startedAt);
    console.log(`  ${session.id}`);
    console.log(
      `    Flow: ${session.metadata.flow} | Entries: ${session.entryCount} | Age: ${age}`,
    );
    console.log(
      `    Email: ${session.metadata.email} | Account: ${session.metadata.emailAccountId}`,
    );
    if (session.metadata.commitSha) {
      console.log(`    SHA: ${session.metadata.commitSha}`);
    }
    console.log();
  }
}

function getAge(startedAt: string): string {
  const ms = Date.now() - new Date(startedAt).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

main().catch(console.error);
