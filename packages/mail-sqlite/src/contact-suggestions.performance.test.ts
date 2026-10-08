import { performance } from "node:perf_hooks";
import { expect, it } from "vitest";
import { createNodeSqliteDriver } from "./node-sqlite";
import { createSqliteMailStore } from "./store";

it("queries indexed prefixes in a 24k-message / 6k-contact store", async () => {
  const driver = createNodeSqliteDriver();
  const store = await createSqliteMailStore(driver);
  try {
    await store.ensureAccount({
      accountId: "a",
      provider: "google",
      generation: "g",
    });
    await driver.write(async (tx) => {
      for (let i = 0; i < 24_000; i++) {
        await tx.execute(
          `INSERT INTO messages(account_id,message_id,conversation_id,provider,subject,preview,from_address,to_json,cc_json,received_at_ms,read,starred,label_ids_json,category_ids_json,roles_json,in_inbox,in_sent,in_draft,in_trash,in_spam,has_attachments)
          VALUES ('a', ?, ?, 'google', '', '', ?, '["me@example.com"]', '[]', ?, 1, 0, '[]', '[]', '[]', 1, 0, 0, 0, 0, 0)`,
          [
            String(i),
            String(i),
            `Person ${i % 6000} <person${i % 6000}@example.com>`,
            1_800_000_000_000 + i,
          ],
        );
      }
    });
    while ((await store.indexContactBacklog()).remaining) {
      /* bounded worker batches */
    }
    const timings: number[] = [];
    for (let i = 0; i < 120; i++) {
      const start = performance.now();
      const results = await store.readContactSuggestions({
        accountId: "a",
        ownAddresses: ["me@example.com"],
        excludeEmails: [],
        query: [
          "person",
          "person1",
          "person23",
          "599",
          "person5999@",
          "missing",
        ][i % 6],
      });
      timings.push(performance.now() - start);
      expect(results.length).toBeLessThanOrEqual(6);
    }
    timings.sort((a, b) => a - b);
    process.stdout.write(
      `CONTACT_QUERY_BENCH messages=24000 contacts=6000 samples=120 median_ms=${timings[60].toFixed(2)} p95_ms=${timings[114].toFixed(2)}\n`,
    );
    // Wall-clock measurements include contention on shared development hosts.
    expect(timings[114]).toBeLessThan(250);
    const plan = await driver.read((tx) =>
      tx.query(
        "EXPLAIN QUERY PLAN SELECT email FROM contact_tokens WHERE account_id = ? AND token >= ? AND token < ?",
        ["a", "person1", "person1\u{10ffff}"],
      ),
    );
    expect(plan.some((row) => String(row.detail).includes("SEARCH"))).toBe(
      true,
    );
  } finally {
    await store.close();
  }
}, 120_000);
