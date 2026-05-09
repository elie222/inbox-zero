#!/usr/bin/env node
// Cross-reference ExecutedRule classifications against Gmail's CATEGORY_* labels.
// Run inside inbox-zero-app from /app:
//   sudo docker exec -w /app inbox-zero-app node /app/category-analysis.mjs

import pg from "pg";
import { createDecipheriv, scryptSync } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function getKey() {
  const secret = process.env.EMAIL_ENCRYPT_SECRET;
  const salt = process.env.EMAIL_ENCRYPT_SALT;
  if (!secret || !salt) throw new Error("missing EMAIL_ENCRYPT_SECRET/SALT");
  return scryptSync(secret, salt, KEY_LENGTH);
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

const CATEGORY_LABELS = [
  "CATEGORY_PROMOTIONS",
  "CATEGORY_SOCIAL",
  "CATEGORY_UPDATES",
  "CATEGORY_FORUMS",
  "CATEGORY_PURCHASES",
  "CATEGORY_PERSONAL",
];

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
  if (!res.ok) throw new Error(`refresh failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

async function getMessageLabels(accessToken, messageId) {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=minimal`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (res.status === 404) return null;
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (res.status === 429) throw new Error("RATE_LIMITED");
  if (!res.ok) throw new Error(`gmail get failed: ${res.status}`);
  const data = await res.json();
  return data.labelIds ?? [];
}

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const acctRes = await client.query(
    `SELECT access_token, refresh_token FROM "Account" WHERE provider='google' LIMIT 1`,
  );
  if (acctRes.rows.length === 0) throw new Error("no google account");
  const refreshToken = decryptToken(acctRes.rows[0].refresh_token);

  console.error("refreshing access token...");
  let accessToken = await refreshAccessToken(refreshToken);

  const erRes = await client.query(`
    SELECT er."messageId", r.name AS rule_name
    FROM "ExecutedRule" er
    JOIN "Rule" r ON er."ruleId" = r.id
    WHERE er."createdAt" > NOW() - INTERVAL '30 days'
      AND er.status = 'APPLIED'
      AND er."ruleId" IS NOT NULL
    ORDER BY er."createdAt" DESC
  `);
  const executed = erRes.rows;
  console.error(`fetched ${executed.length} executed rules. querying Gmail...`);

  const tally = {};
  let processed = 0, errors = 0, notFound = 0;

  for (const e of executed) {
    const ruleName = e.rule_name;
    let attempt = 0;
    while (attempt < 2) {
      try {
        const labels = await getMessageLabels(accessToken, e.messageId);
        if (labels === null) { notFound++; break; }
        const cats = labels.filter((l) => CATEGORY_LABELS.includes(l)).sort();
        const key = cats.length === 0 ? "<none>" : cats.join("+");
        tally[ruleName] ??= {};
        tally[ruleName][key] = (tally[ruleName][key] ?? 0) + 1;
        break;
      } catch (err) {
        if (err.message === "UNAUTHORIZED" && attempt === 0) {
          console.error("token expired, refreshing...");
          accessToken = await refreshAccessToken(refreshToken);
          attempt++;
          continue;
        }
        if (err.message === "RATE_LIMITED" && attempt === 0) {
          await new Promise((r) => setTimeout(r, 1000));
          attempt++;
          continue;
        }
        errors++;
        if (errors < 5) console.error(`error on ${e.messageId}: ${err.message}`);
        break;
      }
    }
    processed++;
    if (processed % 100 === 0) console.error(`  ${processed}/${executed.length}`);
  }

  console.error(`done. processed=${processed} notFound=${notFound} errors=${errors}`);
  console.log(JSON.stringify({
    totalExecuted: executed.length,
    processed, notFound, errors, tally,
  }, null, 2));

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
