#!/usr/bin/env node
// Probe whether CATEGORY_PURCHASES is ever applied to this account.
// Usage (in container): sudo docker exec -w /app inbox-zero-app node /app/purchases-probe.mjs

import pg from "pg";
import { createDecipheriv, scryptSync } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function getKey() {
  return scryptSync(
    process.env.EMAIL_ENCRYPT_SECRET,
    process.env.EMAIL_ENCRYPT_SALT,
    KEY_LENGTH,
  );
}

function decryptToken(value) {
  if (!value) return null;
  const key = getKey();
  const m = value.match(/^v(\d+):([0-9a-f]+)$/i);
  const hex = m ? m[2] : (/^[0-9a-f]+$/i.test(value) ? value : null);
  if (!hex) return value;
  const buffer = Buffer.from(hex, "hex");
  const iv = buffer.subarray(0, IV_LENGTH);
  const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

async function refreshAccessToken(refreshToken) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`refresh failed: ${res.status}`);
  return (await res.json()).access_token;
}

async function gmailFetch(token, path) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const acct = await client.query(
    `SELECT refresh_token FROM "Account" WHERE provider='google' LIMIT 1`,
  );
  const refreshToken = decryptToken(acct.rows[0].refresh_token);
  const token = await refreshAccessToken(refreshToken);

  // 1. Does the CATEGORY_PURCHASES system label exist on this account?
  console.log("=== Probe 1: Is CATEGORY_PURCHASES a known system label? ===");
  const labels = await gmailFetch(token, "/users/me/labels");
  const sysLabels = labels.labels
    .filter((l) => l.type === "system")
    .map((l) => l.id);
  console.log("System labels containing CATEGORY_:");
  for (const l of sysLabels.filter((s) => s.startsWith("CATEGORY_"))) {
    console.log(`  ${l}`);
  }

  // 2. Search Gmail directly for category:purchases
  console.log("\n=== Probe 2: messages.list with q=category:purchases ===");
  const search = await gmailFetch(
    token,
    "/users/me/messages?q=category:purchases&maxResults=10",
  );
  console.log(`resultSizeEstimate: ${search.resultSizeEstimate}`);
  console.log(`returned: ${search.messages?.length ?? 0} messages`);

  if (search.messages?.length) {
    console.log("\nFirst 3 messageIds + their labelIds:");
    for (const m of search.messages.slice(0, 3)) {
      const detail = await gmailFetch(
        token,
        `/users/me/messages/${m.id}?format=minimal`,
      );
      console.log(`  ${m.id}: ${JSON.stringify(detail.labelIds)}`);
    }
  }

  // 3. Check 5 known Receipt messageIds — does anything similar appear?
  console.log("\n=== Probe 3: labelIds on recent Inbox Zero Receipt classifications ===");
  const receipts = await client.query(`
    SELECT er."messageId" FROM "ExecutedRule" er
    JOIN "Rule" r ON er."ruleId" = r.id
    WHERE r.name = 'Receipts' AND er."createdAt" > NOW() - INTERVAL '30 days'
    ORDER BY er."createdAt" DESC LIMIT 10
  `);
  for (const row of receipts.rows) {
    try {
      const detail = await gmailFetch(
        token,
        `/users/me/messages/${row.messageId}?format=minimal`,
      );
      const cats = detail.labelIds.filter((l) => l.startsWith("CATEGORY_"));
      console.log(`  ${row.messageId}: ${cats.join(", ") || "(no CATEGORY_*)"}`);
    } catch (err) {
      console.log(`  ${row.messageId}: ERROR ${err.message}`);
    }
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
