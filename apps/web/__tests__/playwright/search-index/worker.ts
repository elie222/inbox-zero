import initSqlite from "@sqlite.org/sqlite-wasm";
import { createSearchIndex } from "@/utils/email-cache/search-index";
import {
  matchesLocalSearch,
  parseLocalSearch,
  type SearchMessage,
} from "@/utils/email-cache/search-query";

const initialized = initSqlite().then(async (sqlite) => {
  const pool = await sqlite.installOpfsSAHPoolVfs({
    name: "mail-search-test",
    directory: ".mail-search-test",
    initialCapacity: 6,
  });
  return {
    index: createSearchIndex(new pool.OpfsSAHPoolDb("/test.sqlite")),
    sqlite,
  };
});

self.onmessage = async ({
  data,
}: MessageEvent<{ command: string; count?: number }>) => {
  try {
    const { index, sqlite } = await initialized;
    if (data.command === "regression") {
      const labels = [{ id: "custom", name: "Work" }];
      const messages = [
        message(
          "new",
          "2026-09-12",
          "Report",
          "東京の予定 and résumé. A\0hidden marker.",
        ),
        message("old", "2015-09-12", "Report", "Historic meeting"),
        message("same", "2026-09-12", "Other", "A meeting on the same date"),
        {
          ...message("spam", "2026-09-13", "Report", "spam content"),
          labelIds: ["SPAM"],
        },
        {
          ...message("trash", "2026-09-14", "Report", "trash content"),
          labelIds: ["TRASH"],
        },
        {
          ...message(
            "unicode",
            "2026-09-10",
            "ＦＵＬＬ Width",
            "emoji 😀😃. مرحبا",
          ),
          labelIds: ["custom", "STARRED"],
        },
        {
          ...message("undated", "2026-09-10", "Unknown", "undated body"),
          internalDate: "invalid",
        },
      ];
      assert(
        index.resetAccount({
          emailAccountId: "a",
          generation: "first",
          expectedGeneration: null,
        }),
        "initial account",
      );
      assert(
        index.resetAccount({
          emailAccountId: "b",
          generation: "first",
          expectedGeneration: null,
        }),
        "second account",
      );
      assert(
        index.applyBatch({
          emailAccountId: "a",
          generation: "first",
          expectedRevision: 0,
          revision: 1,
          upserts: messages,
          deletes: [],
        }),
        "initial batch",
      );
      assert(
        index.applyBatch({
          emailAccountId: "b",
          generation: "first",
          expectedRevision: 0,
          revision: 1,
          upserts: [message("new", "2026-09-16", "Secret", "other account")],
          deletes: [],
        }),
        "isolated batch",
      );
      const search = (query: string, beforeRowId?: string, limit?: number) =>
        index.search({
          emailAccountId: "a",
          generation: "first",
          query,
          labels,
          beforeRowId,
          limit,
        });
      const queries = [
        "report",
        "r",
        "re",
        "東京",
        "京",
        "😀😃",
        "مرح",
        "full",
        '"report\nsnippet"',
        "hidden",
        '"a\0hidden"',
        '"\0h"',
        '"marker."',
        "subject:report",
        "from:user@example.test",
        "to:recipient",
        "to:re",
        "report 京",
        "report is:unread",
        "label:work",
        "is:starred",
        "in:anywhere",
        "in:spam",
        "in:trash",
        "after:2026/09/11",
        "before:2026/09/11",
        "after:2010/01/01 before:2020/01/01",
        "zz",
        "subject:full 😀",
      ];
      for (const query of queries) {
        const parsed = parseLocalSearch(query, labels);
        assert(parsed, "reference grammar");
        const expected = messages
          .filter((item) => matchesLocalSearch(item, parsed))
          .map((item) => item.id)
          .sort();
        const actual = search(query);
        assert(actual.status === "ready", "query ready");
        assert(
          JSON.stringify(actual.messages.map((item) => item.id).sort()) ===
            JSON.stringify(expected),
          `match parity: ${JSON.stringify(query)} (${JSON.stringify(actual.messages.map((item) => item.id))} vs ${JSON.stringify(expected)})`,
        );
      }
      const paged: string[] = [];
      let cursor: string | undefined;
      do {
        const result = search("in:anywhere", cursor, 2);
        paged.push(...result.messages.map((item) => item.id));
        cursor = result.nextCursor;
      } while (cursor);
      assert(
        paged.length === messages.length &&
          new Set(paged).size === messages.length,
        "complete nonduplicated pagination",
      );
      assert(
        paged.indexOf("old") > paged.indexOf("new"),
        "backfill chronological order",
      );
      assert(
        search("unsupported:operator").status === "unsupported",
        "unsupported query",
      );
      assert(
        !index.applyBatch({
          emailAccountId: "a",
          generation: "first",
          expectedRevision: 0,
          revision: 2,
          upserts: [],
          deletes: ["new"],
        }),
        "out-of-order revision rejected",
      );
      let rolledBack = false;
      try {
        index.applyBatch({
          emailAccountId: "a",
          generation: "first",
          expectedRevision: 1,
          revision: 2,
          upserts: [{ ...messages[0], internalDate: "999999999999999999999" }],
          deletes: ["old"],
        });
      } catch {
        rolledBack = true;
      }
      assert(
        rolledBack &&
          search("historic").messages.length === 1 &&
          search("report").revision === 1,
        "atomic rollback",
      );
      assert(
        index.applyBatch({
          emailAccountId: "a",
          generation: "first",
          expectedRevision: 1,
          revision: 2,
          upserts: [],
          deletes: ["new"],
        }),
        "delete batch",
      );
      assert(!search("hidden").messages.length, "deleted body removed");
      assert(
        !index.applyBatch({
          emailAccountId: "a",
          generation: "first",
          expectedRevision: 1,
          revision: 2,
          upserts: [messages[0]],
          deletes: [],
        }),
        "different work at an already committed revision is rejected",
      );
      assert(
        !search("hidden").messages.length,
        "replay cannot resurrect deletion",
      );
      const retained = {
        ...message("retained", "2026-09-15", "Replacement", "retained body"),
        threadId: "replace",
      };
      const vanished = {
        ...message("vanished", "2026-09-15", "Replacement", "vanished body"),
        threadId: "replace",
      };
      assert(
        index.applyBatch({
          emailAccountId: "a",
          generation: "first",
          expectedRevision: 2,
          revision: 3,
          upserts: [retained, vanished],
          deletes: [],
        }),
        "thread snapshot",
      );
      const originalRowId = search("retained").messages[0].rowId;
      assert(
        index.applyBatch({
          emailAccountId: "a",
          generation: "first",
          expectedRevision: 3,
          revision: 4,
          replacement: {
            threadId: "replace",
            token: "snapshot",
            phase: "start",
          },
          upserts: [retained],
          deletes: [],
        }),
        "replacement start",
      );
      assert(
        search("retained").pendingReplacements,
        "incomplete replacement reported",
      );
      assert(
        index.applyBatch({
          emailAccountId: "a",
          generation: "first",
          expectedRevision: 4,
          revision: 5,
          replacement: {
            threadId: "replace",
            token: "snapshot",
            phase: "finish",
          },
          upserts: [],
          deletes: [],
        }),
        "replacement finish",
      );
      assert(
        !search("vanished").messages.length &&
          !search("retained").pendingReplacements,
        "replacement removes vanished members",
      );
      assert(
        index.applyBatch({
          emailAccountId: "a",
          generation: "first",
          expectedRevision: 5,
          revision: 6,
          upserts: [{ ...retained, threadId: "moved" }],
          deletes: [],
        }),
        "thread move",
      );
      assert(
        search("retained").messages[0].rowId === originalRowId &&
          search("retained").messages[0].threadId === "moved",
        "moved identity retained",
      );
      assert(
        !index.applyBatch({
          emailAccountId: "a",
          generation: "first",
          expectedRevision: 4,
          revision: 5,
          replacement: {
            threadId: "replace",
            token: "snapshot",
            phase: "finish",
          },
          upserts: [vanished],
          deletes: [],
        }),
        "stale replacement replay is rejected",
      );
      assert(
        !search("vanished").messages.length,
        "replacement replay cannot resurrect member",
      );
      assert(
        index.applyBatch({
          emailAccountId: "a",
          generation: "first",
          expectedRevision: 6,
          revision: 7,
          replacement: { threadId: "moved", token: "empty", phase: "start" },
          upserts: [],
          deletes: [],
        }),
        "empty replacement start",
      );
      assert(
        index.applyBatch({
          emailAccountId: "a",
          generation: "first",
          expectedRevision: 7,
          revision: 8,
          replacement: { threadId: "moved", token: "empty", phase: "finish" },
          upserts: [],
          deletes: [],
        }),
        "empty replacement finish",
      );
      assert(
        !search("retained").messages.length,
        "empty replacement clears thread",
      );
      assert(
        index.resetAccount({
          emailAccountId: "a",
          generation: "second",
          expectedGeneration: "first",
        }),
        "generation reset",
      );
      assert(
        !index.resetAccount({
          emailAccountId: "a",
          generation: "third",
          expectedGeneration: "first",
        }),
        "stale reset fenced",
      );
      assert(
        !index.applyBatch({
          emailAccountId: "a",
          generation: "first",
          expectedRevision: 2,
          revision: 3,
          upserts: messages,
          deletes: [],
        }),
        "stale writer fenced",
      );
      assert(
        index.search({
          emailAccountId: "a",
          generation: "second",
          query: "in:anywhere",
          labels,
        }).messages.length === 0,
        "reset clears account",
      );
      assert(
        index.search({
          emailAccountId: "b",
          generation: "first",
          query: "secret",
          labels: [],
        }).messages.length === 1,
        "reset preserves another account",
      );
      self.postMessage({
        result: { assertions: "passed", queries: queries.length },
      });
    } else if (data.command === "storage-limit") {
      index.resetAccount({
        emailAccountId: "capacity",
        generation: "first",
        expectedGeneration: null,
      });
      const before = index.getStorageBytes();
      index.setStorageLimit(before);
      const batch = {
        emailAccountId: "capacity",
        generation: "first",
        expectedRevision: 0,
        revision: 1,
        upserts: [
          {
            ...message("large", "2026-09-12", "Capacity", "body"),
            textPlain: "bounded storage capacity ".repeat(40_000),
          },
        ],
        deletes: [],
      };
      let failed = false;
      let failureDetail = "no error";
      try {
        index.applyBatch(batch);
      } catch (error) {
        failureDetail = String(error);
        failed =
          typeof error === "object" &&
          error !== null &&
          "resultCode" in error &&
          typeof error.resultCode === "number" &&
          (error.resultCode & 0xff) === 13;
      }
      assert(
        failed,
        `SQLite enforces the configured page limit: ${failureDetail}`,
      );
      assert(
        index.getStorageBytes() === before,
        "failed batch does not grow the database",
      );
      assert(
        index.getAccountState("capacity")?.revision === 0,
        "failed batch retains the source checkpoint",
      );
      assert(
        index.search({
          emailAccountId: "capacity",
          generation: "first",
          query: "capacity",
          labels: [],
        }).messages.length === 0,
        "failed batch leaves no partial search result",
      );
      index.setStorageLimit(before + 32 * 1024 * 1024);
      assert(
        index.applyBatch(batch),
        "the same batch resumes after capacity is increased",
      );
      assert(
        index.getAccountState("capacity")?.revision === 1,
        "successful retry commits once",
      );
      index.setStorageLimit(2 * 1024 * 1024 * 1024);
      self.postMessage({ result: "passed" });
    } else if (data.command === "stage") {
      index.resetAccount({
        emailAccountId: "large",
        generation: "first",
        expectedGeneration: null,
      });
      const messages = Array.from({ length: 150 }, (_, i) => ({
        ...message(
          `large-${i}`,
          "2026-09-10",
          "Large conversation",
          `message ${i}`,
        ),
        threadId: "large-thread",
      }));
      const base = {
        emailAccountId: "large",
        generation: "first",
        deletes: [],
      };
      assert(
        index.applyBatch({
          ...base,
          expectedRevision: 0,
          revision: 1,
          upserts: messages.slice(0, 100),
        }),
        "large initial page",
      );
      assert(
        index.applyBatch({
          ...base,
          expectedRevision: 1,
          revision: 2,
          upserts: [
            ...messages.slice(100),
            { ...messages[0], id: "vanished-large" },
          ],
        }),
        "large initial tail",
      );
      assert(
        index.applyBatch({
          ...base,
          expectedRevision: 2,
          revision: 3,
          replacement: {
            threadId: "large-thread",
            token: "interrupted",
            phase: "start",
          },
          upserts: messages.slice(0, 100),
        }),
        "large replacement partial",
      );
      self.postMessage({ result: "staged" });
    } else if (data.command === "resume") {
      const messages = Array.from({ length: 150 }, (_, i) => ({
        ...message(
          `large-${i}`,
          "2026-09-10",
          "Large conversation",
          `message ${i}`,
        ),
        threadId: "large-thread",
      }));
      const base = {
        emailAccountId: "large",
        generation: "first",
        deletes: [],
      };
      assert(
        index.getAccountState("large")?.revision === 3 &&
          index.getThreadReplacementState("large", "large-thread")?.token ===
            "interrupted",
        "midstream state survives crash",
      );
      assert(
        !index.applyBatch({
          ...base,
          expectedRevision: 2,
          revision: 3,
          replacement: {
            threadId: "large-thread",
            token: "interrupted",
            phase: "start",
          },
          upserts: messages.slice(0, 100),
        }),
        "committed page replay after crash is rejected",
      );
      assert(
        index.applyBatch({
          ...base,
          expectedRevision: 3,
          revision: 4,
          replacement: {
            threadId: "large-thread",
            token: "interrupted",
            phase: "continue",
          },
          upserts: messages.slice(100),
        }),
        "resumed large tail",
      );
      assert(
        index.applyBatch({
          ...base,
          expectedRevision: 4,
          revision: 5,
          replacement: {
            threadId: "large-thread",
            token: "newer",
            phase: "start",
          },
          upserts: messages.slice(0, 100),
        }),
        "newer replacement supersedes",
      );
      assert(
        !index.applyBatch({
          ...base,
          expectedRevision: 5,
          revision: 6,
          replacement: {
            threadId: "large-thread",
            token: "interrupted",
            phase: "finish",
          },
          upserts: [],
        }),
        "superseded finalizer rejected",
      );
      assert(
        !index.applyBatch({
          ...base,
          expectedRevision: 5,
          revision: 6,
          replacement: {
            threadId: "large-thread",
            token: "interrupted",
            phase: "continue",
          },
          upserts: messages.slice(100),
        }),
        "superseded page rejected",
      );
      assert(
        index.getAccountState("large")?.revision === 5,
        "rejected work cannot advance revision",
      );
      assert(
        !index.applyBatch({
          ...base,
          expectedRevision: 5,
          revision: 6,
          upserts: [messages[0]],
        }),
        "uncoordinated replacement writes rejected",
      );
      assert(
        index.applyBatch({
          ...base,
          expectedRevision: 5,
          revision: 6,
          replacement: {
            threadId: "large-thread",
            token: "newer",
            phase: "finish",
          },
          upserts: messages.slice(100),
        }),
        "newer replacement completed",
      );
      const ids: string[] = [];
      let cursor: string | undefined;
      do {
        const result = index.search({
          emailAccountId: "large",
          generation: "first",
          query: "large",
          labels: [],
          limit: 100,
          beforeRowId: cursor,
        });
        assert(
          !result.pendingReplacements,
          "finished replacement no longer pending",
        );
        ids.push(...result.messages.map((item) => item.id));
        cursor = result.nextCursor;
      } while (cursor);
      assert(
        ids.length === 150 &&
          new Set(ids).size === 150 &&
          !ids.includes("vanished-large"),
        "complete large replacement without stale members",
      );
      self.postMessage({ result: "passed" });
    } else if (data.command === "reopen") {
      const result = index.search({
        emailAccountId: "b",
        generation: "first",
        query: "secret",
        labels: [],
      });
      assert(result.messages.length === 1, "persisted reopen");
      self.postMessage({ result: "passed" });
    } else if (data.command === "benchmark") {
      index.resetAccount({
        emailAccountId: "benchmark",
        generation: "bench",
        expectedGeneration: null,
      });
      const started = performance.now();
      let revision = 0;
      for (let i = 0; i < (data.count ?? 10_000); i += 100) {
        const batch = Array.from(
          { length: Math.min(100, (data.count ?? 10_000) - i) },
          (_, offset) => {
            const n = i + offset;
            return {
              ...message(
                `message-${n}`,
                "2026-01-01",
                "Project meeting",
                `${"review delivery résumé 東京の予定 invoice update ".repeat(20)} ${n % 997 === 0 ? "uncommonneedle" : ""}`,
              ),
              internalDate: String(1_700_000_000_000 + Math.floor(n / 3)),
            };
          },
        );
        assert(
          index.applyBatch({
            emailAccountId: "benchmark",
            generation: "bench",
            expectedRevision: revision,
            revision: revision + 1,
            upserts: batch,
            deletes: [],
          }),
          "benchmark batch",
        );
        revision++;
        if (i % 10_000 === 0) self.postMessage({ progress: i });
      }
      const buildMs = performance.now() - started;
      const queries: Record<
        string,
        { p50: number; p95: number; count: number }
      > = {};
      for (const query of [
        "meeting",
        "uncommonneedle",
        "東京",
        "r",
        "zz",
        "meeting 東",
        "is:unread",
        "subject:meeting",
        "meeting after:2020/01/01",
      ]) {
        const samples: number[] = [];
        let count = 0;
        for (let repeat = 0; repeat < 20; repeat++) {
          const start = performance.now();
          count = index.search({
            emailAccountId: "benchmark",
            generation: "bench",
            query,
            labels: [],
          }).messages.length;
          samples.push(performance.now() - start);
        }
        samples.sort((a, b) => a - b);
        queries[query] = { p50: samples[9], p95: samples[18], count };
      }
      self.postMessage({
        result: {
          count: data.count ?? 10_000,
          buildMs,
          queries,
          storageBytes: index.getStorageBytes(),
          wasmMemoryBytes: sqlite.wasm.heap8u().length,
        },
      });
    }
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.stack : String(error),
    });
  }
};

function message(
  id: string,
  date: string,
  subject: string,
  textPlain: string,
): SearchMessage {
  return {
    id,
    threadId: `thread-${id}`,
    subject,
    snippet: "Snippet",
    headers: {
      from: "User <user@example.test>",
      to: "recipient@example.test",
      subject,
      date: "",
    },
    labelIds: ["INBOX", "UNREAD"],
    internalDate: String(Date.parse(`${date}T12:00:00Z`)),
    textPlain,
  };
}

function assert(condition: unknown, name: string): asserts condition {
  if (!condition) throw new Error(name);
}
