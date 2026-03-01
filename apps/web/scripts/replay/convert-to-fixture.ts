// Run with: `npx dotenv -e .env.local -- tsx scripts/replay/convert-to-fixture.ts <session-id> [output-path]`
// Or: `pnpm replay:convert <session-id> [output-path]`

import "dotenv/config";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { exportSession } from "@/utils/replay/recorder";
import type { ReplayFixture } from "@/utils/replay/types";

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

async function main() {
  const sessionId = process.argv[2];
  const outputPath = process.argv[3];

  if (!sessionId) {
    console.error("Usage: pnpm replay:convert <session-id> [output-path]");
    console.error("  Use `pnpm replay:list` to find session IDs.");
    process.exit(1);
  }

  const session = await exportSession(sessionId);

  if (!session) {
    console.error(`Session not found: ${sessionId}`);
    process.exit(1);
  }

  const emailMap = buildEmailMap(session);

  const fixture: ReplayFixture = {
    metadata: {
      description: `Recorded ${session.metadata.flow} flow`,
      flow: session.metadata.flow,
      recordedAt: session.metadata.startedAt,
      commitSha: session.metadata.commitSha,
    },
    setup: {
      emailAccount: {},
      rules: [],
    },
    entries: session.entries.map((entry) => ({
      ...entry,
      request: stripPII(entry.request, emailMap),
      response: entry.response ? stripPII(entry.response, emailMap) : undefined,
    })),
  };

  const json = JSON.stringify(fixture, null, 2);

  if (outputPath) {
    const fullPath = resolve(outputPath);
    writeFileSync(fullPath, json);
    console.error(`Fixture written to: ${fullPath}`);
  } else {
    console.log(json);
  }

  if (emailMap.size > 0) {
    console.error("\nEmail address mapping (for reference):");
    for (const [original, replacement] of emailMap) {
      console.error(`  ${original} → ${replacement}`);
    }
  }
}

function buildEmailMap(session: {
  metadata: { email: string };
  entries: Array<{ request: unknown; response?: unknown }>;
}): Map<string, string> {
  const emails = new Set<string>();
  const raw = JSON.stringify(session);

  for (const match of raw.matchAll(EMAIL_PATTERN)) {
    emails.add(match[0].toLowerCase());
  }

  const map = new Map<string, string>();
  let counter = 1;

  for (const email of emails) {
    const [, domain] = email.split("@");
    const isTestEmail = domain?.includes("test") || domain?.includes("example");
    if (isTestEmail) continue;

    map.set(email, `user${counter}@test.com`);
    counter++;
  }

  return map;
}

function stripPII(data: unknown, emailMap: Map<string, string>): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data === "number" || typeof data === "boolean") return data;

  if (typeof data === "string") {
    let result = data;
    for (const [original, replacement] of emailMap) {
      result = result.replaceAll(original, replacement);
    }
    // Strip auth tokens
    if (
      result.startsWith("ya29.") ||
      result.startsWith("Bearer ") ||
      result.startsWith("eyJ")
    ) {
      return "[REDACTED]";
    }
    return result;
  }

  if (Array.isArray(data)) {
    return data.map((item) => stripPII(item, emailMap));
  }

  if (typeof data === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(
      data as Record<string, unknown>,
    )) {
      // Redact known sensitive fields
      if (
        key === "accessToken" ||
        key === "refreshToken" ||
        key === "token" ||
        key === "apiKey"
      ) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = stripPII(value, emailMap);
      }
    }
    return result;
  }

  return data;
}

main().catch(console.error);
