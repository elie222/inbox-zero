// Synthetic-mailbox benchmark for compressed message bodies.
// Run from the repository root:
//   MAIL_BENCH_DB=/tmp/bodies.sqlite pnpm exec tsx packages/mail-sqlite/scripts/benchmark-body-compression.ts
import { performance } from "node:perf_hooks";
import { rmSync, statSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import type { SqliteDriver } from "../src/driver";
import { createNodeSqliteDriver, nodeBodyCodec } from "../src/node-sqlite";
import { createSqliteMailStore } from "../src/store";
import {
  decodeMessageBody,
  type MessageBodyCodec,
} from "../src/message-body-codec";

const COUNT = Number(process.env.MAIL_BENCH_COUNT ?? 50_000);
const PATH = process.env.MAIL_BENCH_DB ?? "/tmp/mail-body-bench.sqlite";
const ACCOUNT = "bench";

export async function runBodyBenchmark(input: {
  driver: SqliteDriver;
  codec: MessageBodyCodec;
  count: number;
  fileSize?: () => number;
}) {
  const { driver, codec, count } = input;
  const seeded = await createSqliteMailStore(driver, { bodyCodec: codec });
  await seeded.ensureAccount({
    accountId: ACCOUNT,
    provider: "google",
    generation: "g1",
  });
  await seedLegacyMailbox(driver, count);
  const before = await sizes(driver, input.fileSize);
  const openBefore = await timeReads((id) => readBodies(driver, id), count);
  const started = performance.now();
  await createSqliteMailStore(driver, { bodyCodec: codec });
  const migrationMs = Math.round(performance.now() - started);
  const after = await sizes(driver, input.fileSize);
  const openAfter = await timeReads(async (id) => {
    for (const row of await readBodies(driver, id)) {
      await decodeMessageBody(codec, row.html);
      await decodeMessageBody(codec, row.text);
    }
  }, count);
  return {
    count,
    before,
    after,
    migrationMs,
    openConversationMs: { before: openBefore, after: openAfter },
  };
}

async function main() {
  for (const suffix of ["", "-wal", "-shm"])
    rmSync(PATH + suffix, { force: true });
  const driver = createNodeSqliteDriver(PATH);
  const result = await runBodyBenchmark({
    driver,
    codec: nodeBodyCodec,
    count: COUNT,
    fileSize: () => statSync(PATH).size,
  });
  await driver.close();
  const database = new DatabaseSync(PATH);
  const vacuumStart = performance.now();
  database.exec("VACUUM");
  const vacuumMs = Math.round(performance.now() - vacuumStart);
  database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  database.close();
  const vacuumed = statSync(PATH).size;
  console.log(
    JSON.stringify(
      { ...result, vacuum: { ms: vacuumMs, fileBytes: vacuumed } },
      null,
      2,
    ),
  );
  for (const suffix of ["", "-wal", "-shm"])
    rmSync(PATH + suffix, { force: true });
}

// Rows are inserted the way builds before compression stored them: TEXT
// bodies, with HTML messages also keeping their text part.
async function seedLegacyMailbox(driver: SqliteDriver, count: number) {
  const random = mulberry32(42);
  await driver.write((tx) =>
    tx.execute(
      `WITH RECURSIVE nums(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM nums WHERE i < ?)
       INSERT INTO effective_messages(account_id, message_id, conversation_id, subject, preview, from_address, to_json, received_at_ms, read, starred, folder_id, label_ids_json, category_ids_json, roles_json, in_inbox, in_sent, in_draft, in_trash, in_spam, has_attachments, pending_operation_ids_json)
       SELECT ?, 'm' || i, 'c' || (i / 3), 'Subject ' || i, 'Preview', 'sender@example.com', '[]', i, 1, 0, 'inbox', '[]', '[]', '["inbox"]', 1, 0, 0, 0, 0, 0, '[]' FROM nums`,
      [count, ACCOUNT],
    ),
  );
  const chunk = 1000;
  for (let start = 1; start <= count; start += chunk) {
    await driver.write(async (tx) => {
      for (let i = start; i < Math.min(start + chunk, count + 1); i++) {
        const isHtml = random() < 0.75;
        const text = plainText(random, isHtml ? 6 : 3);
        const html = isHtml ? newsletterHtml(random) : null;
        await tx.execute(
          "INSERT INTO message_content(account_id, message_id, version, html, text, attachments_json) VALUES (?, ?, '1', ?, ?, '[]')",
          [ACCOUNT, `m${i}`, html, text],
        );
      }
    });
  }
  await driver.write((tx) =>
    tx.execute("DELETE FROM schema_migrations WHERE id = 8"),
  );
}

async function sizes(driver: SqliteDriver, fileSize?: () => number) {
  await driver
    .write((tx) => tx.exec("PRAGMA wal_checkpoint(TRUNCATE)"))
    .catch(() => undefined);
  const [row] = await driver.read((tx) =>
    tx.query(
      `SELECT (SELECT page_count FROM pragma_page_count()) AS pages,
              (SELECT freelist_count FROM pragma_freelist_count()) AS free_pages,
              (SELECT page_size FROM pragma_page_size()) AS page_size,
              (SELECT SUM(COALESCE(length(CAST(html AS BLOB)), 0)) FROM message_content) AS html_bytes,
              (SELECT SUM(COALESCE(length(CAST(text AS BLOB)), 0)) FROM message_content) AS text_bytes`,
    ),
  );
  const pageSize = Number(row?.page_size);
  return {
    fileBytes: fileSize?.() ?? Number(row?.pages) * pageSize,
    usedBytes: (Number(row?.pages) - Number(row?.free_pages)) * pageSize,
    freeBytes: Number(row?.free_pages) * pageSize,
    htmlBytes: Number(row?.html_bytes),
    textBytes: Number(row?.text_bytes),
  };
}

// The body part of opening a conversation: the queries readConversation
// runs, plus inflating each body once they are compressed.
async function readBodies(driver: SqliteDriver, conversationId: string) {
  return driver.read(async (tx) => {
    const rows = await tx.query(
      "SELECT message_id FROM effective_messages WHERE account_id = ? AND conversation_id = ?",
      [ACCOUNT, conversationId],
    );
    return tx.query(
      `SELECT html, text, attachments_json FROM message_content WHERE account_id = ? AND message_id IN (${rows.map(() => "?").join(",") || "NULL"})`,
      [ACCOUNT, ...rows.map((row) => String(row.message_id))],
    );
  });
}

async function timeReads(
  read: (conversationId: string) => Promise<unknown>,
  count: number,
) {
  const random = mulberry32(7);
  const samples: number[] = [];
  for (let run = 0; run < 300; run++) {
    const conversationId = `c${Math.floor(random() * (count / 3))}`;
    const started = performance.now();
    await read(conversationId);
    samples.push(performance.now() - started);
  }
  return {
    medianMs: round(percentile(samples, 0.5)),
    p95Ms: round(percentile(samples, 0.95)),
  };
}

const WORDS =
  "the product update team launch customer quarterly revenue design feature release invite webinar offer discount member account security review schedule report market growth insight community story event partner price plan upgrade support guide tutorial workshop summit keynote analytics data cloud platform mobile desktop privacy policy terms".split(
    " ",
  );

function sentence(random: () => number, words: number) {
  const parts: string[] = [];
  for (let i = 0; i < words; i++) {
    parts.push(WORDS[Math.floor(random() * WORDS.length)] ?? "mail");
  }
  return `${parts.join(" ")}.`;
}

function plainText(random: () => number, paragraphs: number) {
  const out: string[] = [];
  for (let i = 0; i < paragraphs; i++) {
    out.push(sentence(random, 30 + Math.floor(random() * 60)));
  }
  return out.join("\n\n");
}

function token(random: () => number, length: number) {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[Math.floor(random() * alphabet.length)];
  }
  return out;
}

// Newsletter-shaped HTML: inline-styled nested tables, tracking links with
// unique ids, and article copy. Averages roughly 17KB, like the measured
// real-mailbox HTML average.
function newsletterHtml(random: () => number) {
  const articles = 5 + Math.floor(random() * 10);
  const blocks: string[] = [];
  for (let i = 0; i < articles; i++) {
    const link = `https://click.example.com/ls/click?upn=${token(random, 120)}`;
    blocks.push(`<tr><td style="padding:24px 32px;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:24px;color:#333333;background-color:#ffffff;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:0 0 12px 0;">
<h2 style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:22px;line-height:28px;color:#111111;font-weight:bold;">${sentence(random, 6)}</h2></td></tr>
<tr><td style="padding:0 0 16px 0;"><img src="https://img.example.com/${token(random, 24)}.png" width="536" alt="${sentence(random, 4)}" style="display:block;width:100%;max-width:536px;border:0;" /></td></tr>
<tr><td style="padding:0;"><p style="margin:0 0 16px 0;">${sentence(random, 40 + Math.floor(random() * 80))}</p>
<a href="${link}" style="display:inline-block;padding:12px 24px;background-color:#0066ff;color:#ffffff;text-decoration:none;border-radius:4px;font-weight:bold;">Read more</a></td></tr></table></td></tr>`);
  }
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style type="text/css">body{margin:0;padding:0;}table{border-collapse:collapse;}img{border:0;outline:none;}@media only screen and (max-width:600px){.container{width:100%!important;}.stack{display:block!important;width:100%!important;}}</style></head>
<body style="margin:0;padding:0;background-color:#f4f4f4;"><img src="https://open.example.com/o/${token(random, 64)}" width="1" height="1" alt="" />
<table role="presentation" class="container" width="600" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;background-color:#ffffff;">
${blocks.join("\n")}
<tr><td style="padding:24px 32px;font-size:12px;line-height:18px;color:#888888;">You are receiving this email because you signed up. <a href="https://example.com/unsubscribe?u=${token(random, 48)}" style="color:#888888;">Unsubscribe</a></td></tr>
</table></body></html>`;
}

function mulberry32(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d_2b_79_f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function percentile(values: number[], p: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return (
    sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0
  );
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
