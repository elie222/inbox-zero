// Query-only microbenchmark; synthetic metadata bypasses provider ingestion.
// Run from the repository root: pnpm exec tsx packages/mail-sqlite/scripts/benchmark-queries.ts
import { performance } from "node:perf_hooks";
import { cpus, platform, arch } from "node:os";
import { createNodeSqliteDriver } from "../src/node-sqlite";
import { createSqliteMailStore } from "../src/store";

async function main() {
  console.log(
    JSON.stringify({
      node: process.version,
      platform: platform(),
      arch: arch(),
      cpu: cpus()[0]?.model,
    }),
  );
  for (const count of [10_000, 100_000, 1_000_000]) {
    const driver = createNodeSqliteDriver();
    const store = await createSqliteMailStore(driver);
    await store.ensureAccount({
      accountId: "benchmark",
      provider: "google",
      generation: "g1",
    });
    await driver.write((tx) =>
      tx.execute(
        `WITH RECURSIVE nums(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM nums WHERE i < ?)
      INSERT INTO effective_messages(account_id,message_id,conversation_id,subject,preview,from_address,to_json,received_at_ms,read,starred,folder_id,label_ids_json,category_ids_json,roles_json,in_inbox,in_sent,in_draft,in_trash,in_spam,has_attachments,pending_operation_ids_json)
      SELECT 'benchmark','m'||i,'c'||i,'Subject '||i,'Preview','sender@example.com','[]',i,i%2,0,'inbox','[]','[]','["inbox"]',1,0,0,0,0,0,'[]' FROM nums`,
        [count],
      ),
    );
    const query = {
      accountIds: ["benchmark"],
      predicate: { kind: "role" as const, role: "inbox" as const },
      order: "newest_first" as const,
      pageSize: 25,
      after: null,
    };
    const samples = [];
    for (let run = 0; run < 21; run++) {
      const started = performance.now();
      const result = await store.readMailboxView(query);
      samples.push(performance.now() - started);
      if (
        result.view.conversations.length !== 25 ||
        result.view.counts.matchingConversations !== count
      )
        throw new Error("Incorrect benchmark result");
    }
    const warm = samples.slice(1).sort((a, b) => a - b);
    console.log(
      JSON.stringify({
        count,
        coldMs: samples[0],
        warmMedianMs: warm[9],
        warmP95Ms: warm[18],
        rssMb: process.memoryUsage().rss / 1024 / 1024,
      }),
    );
    await store.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
