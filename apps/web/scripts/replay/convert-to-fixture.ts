// Run with: `npx dotenv -e .env.local -- tsx scripts/replay/convert-to-fixture.ts <session-id> [output-path]`
// Or: `pnpm replay:convert <session-id> [output-path]`

import "dotenv/config";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { exportSession } from "@/utils/replay/recorder";
import type { ReplayFixture } from "@/utils/replay/types";

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/g;
const SAFE_HEADER_KEYS = new Set([
  "from",
  "to",
  "cc",
  "bcc",
  "reply-to",
  "subject",
  "date",
  "list-unsubscribe",
]);

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
  const flow = inferFlow(session);

  const fixture: ReplayFixture = {
    metadata: {
      description: `Recorded ${flow} flow`,
      flow,
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

function stripPII(
  data: unknown,
  emailMap: Map<string, string>,
  parentKey?: string,
): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data === "number" || typeof data === "boolean") return data;

  if (typeof data === "string") {
    return sanitizeString(data, emailMap, parentKey);
  }

  if (Array.isArray(data)) {
    return data.map((item) => stripPII(item, emailMap, parentKey));
  }

  if (typeof data === "object") {
    if (isMessageLike(data)) {
      return sanitizeMessageLike(data as Record<string, unknown>, emailMap);
    }

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(
      data as Record<string, unknown>,
    )) {
      if (
        key === "accessToken" ||
        key === "refreshToken" ||
        key === "token" ||
        key === "apiKey"
      ) {
        result[key] = "[REDACTED]";
      } else if (key === "headers" && typeof value === "object" && value) {
        result[key] = sanitizeHeaders(
          value as Record<string, unknown>,
          emailMap,
        );
      } else {
        result[key] = stripPII(value, emailMap, key);
      }
    }
    return result;
  }

  return data;
}

function sanitizeString(
  value: string,
  emailMap: Map<string, string>,
  parentKey?: string,
): string {
  let result = value;

  for (const [original, replacement] of emailMap) {
    result = result.replaceAll(
      new RegExp(escapeRegExp(original), "gi"),
      replacement,
    );
  }

  result = result.replace(URL_PATTERN, "https://example.test");
  result = result.replace(
    /([A-Za-z][A-Za-z0-9 .,'&/+-]{0,60}) <(user\d+@test\.com)>/g,
    "Test User <$2>",
  );
  result = result.replace(
    /<name>[^<]{1,80}<\/name>/g,
    "<name>Test User</name>",
  );

  if (
    result.startsWith("ya29.") ||
    result.startsWith("Bearer ") ||
    result.startsWith("eyJ")
  ) {
    return "[REDACTED]";
  }

  if (parentKey === "textHtml") {
    return "[HTML omitted]";
  }

  if (parentKey === "textPlain" || parentKey === "snippet") {
    return stripQuotedReplies(result);
  }

  return truncate(result, 4000);
}

function sanitizeHeaders(
  headers: Record<string, unknown>,
  emailMap: Map<string, string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (!SAFE_HEADER_KEYS.has(key.toLowerCase())) continue;
    result[key] = stripPII(value, emailMap, key);
  }

  return result;
}

function sanitizeMessageLike(
  message: Record<string, unknown>,
  emailMap: Map<string, string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const allowedKeys = [
    "id",
    "threadId",
    "labelIds",
    "snippet",
    "historyId",
    "internalDate",
    "headers",
    "textPlain",
    "subject",
    "date",
    "inline",
  ];

  for (const key of allowedKeys) {
    if (!(key in message)) continue;
    const value = message[key];
    if (key === "headers" && typeof value === "object" && value) {
      result[key] = sanitizeHeaders(value as Record<string, unknown>, emailMap);
    } else {
      result[key] = stripPII(value, emailMap, key);
    }
  }

  return result;
}

function isMessageLike(value: unknown): value is Record<string, unknown> {
  return !!(
    value &&
    typeof value === "object" &&
    "headers" in value &&
    ("id" in value || "threadId" in value)
  );
}

function stripQuotedReplies(value: string): string {
  const normalized = value.replace(/\r\n/g, "\n");
  const quotedMarkers = [
    /\nOn [\s\S]+? wrote:\n/,
    /\n--\n/,
    /\nReply directly to this email, or go to chat\./,
  ];

  for (const marker of quotedMarkers) {
    const match = normalized.match(marker);
    if (match?.index != null) {
      return normalized.slice(0, match.index).trim();
    }
  }

  return normalized.trim();
}

function truncate(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}...[TRUNCATED]`;
}

function inferFlow(session: {
  metadata: { flow: ReplayFixture["metadata"]["flow"] };
  entries: Array<{ type: string }>;
}): ReplayFixture["metadata"]["flow"] {
  if (
    session.metadata.flow === "webhook" &&
    !session.entries.some((entry) => entry.type === "webhook")
  ) {
    return "rule-run";
  }

  return session.metadata.flow;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
