import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { chromium } from "@playwright/test";

const count = Number(process.argv[2] ?? 10_000);
if (!Number.isSafeInteger(count) || count < 1 || count > 250_000)
  throw new Error("Choose a document count from 1 to 250000");

const directory = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(directory, "../../..");
const require = createRequire(import.meta.url);
const output = await mkdtemp(path.join(tmpdir(), "mail-index-test-"));
const sqliteDirectory = path.dirname(
  require.resolve("@sqlite.org/sqlite-wasm/package.json"),
);
await build({
  entryPoints: {
    worker: path.join(directory, "worker.ts"),
    production: path.join(app, "utils/email-cache/search-index.worker.ts"),
  },
  bundle: true,
  platform: "browser",
  format: "esm",
  outdir: output,
  tsconfig: path.join(app, "tsconfig.json"),
  logLevel: "warning",
});
await copyFile(
  path.join(sqliteDirectory, "dist/sqlite3.wasm"),
  path.join(output, "sqlite3.wasm"),
);
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, "http://localhost").pathname;
    if (pathname === "/") {
      response.end("<!doctype html><title>Local mail index tests</title>");
      return;
    }
    if (!["/worker.js", "/production.js", "/sqlite3.wasm"].includes(pathname)) {
      response.writeHead(404).end();
      return;
    }
    response.setHeader(
      "Content-Type",
      pathname.endsWith(".wasm") ? "application/wasm" : "text/javascript",
    );
    response.end(await readFile(path.join(output, pathname.slice(1))));
  } catch {
    response.writeHead(500).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const start = () =>
    page.evaluate(() => {
      window.indexWorker = new Worker("/worker.js", { type: "module" });
    });
  const send = (command, count) =>
    page.evaluate(
      ({ command, count }) =>
        new Promise((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error("Index worker timed out")),
            300_000,
          );
          window.indexWorker.onerror = (event) => {
            clearTimeout(timeout);
            reject(new Error(event.message));
          };
          window.indexWorker.onmessage = ({ data }) => {
            if (data.progress !== undefined) return;
            clearTimeout(timeout);
            if (data.error) reject(new Error(data.error));
            else resolve(data.result);
          };
          window.indexWorker.postMessage({ command, count });
        }),
      { command, count },
    );
  await start();
  const regression = await send("regression");
  await send("stage");
  await page.evaluate(() => window.indexWorker.terminate());
  await start();
  const reopen = await send("reopen");
  const stagedReplacement = await send("resume");
  const storageLimit = await send("storage-limit");
  const benchmark = await send("benchmark", count);
  const reclamation = await send("reclaim");
  const cleanup = await page.evaluate(async () => {
    window.indexWorker.terminate();
    let worker = new Worker("/production.js", { type: "module" });
    let id = 0;
    const rpc = (request) =>
      new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("Production worker timed out")),
          30_000,
        );
        worker.onerror = (event) => {
          clearTimeout(timeout);
          reject(new Error(event.message));
        };
        worker.onmessage = ({ data }) => {
          clearTimeout(timeout);
          resolve(data);
        };
        worker.postMessage({ id: ++id, ...request });
      });
    const check = (condition, name) => {
      if (!condition) throw new Error(name);
    };
    const request = {
      emailAccountId: "cleanup",
      generation: "first",
      expectedGeneration: null,
    };
    check(
      (await rpc({ command: "reset", request })).result === true,
      "worker reset",
    );
    const batch = {
      emailAccountId: "cleanup",
      generation: "first",
      expectedRevision: 0,
      revision: 1,
      deletes: [],
      upserts: [
        {
          id: "message",
          threadId: "thread",
          subject: "Sample",
          snippet: "",
          headers: { from: "", to: "", subject: "Sample", date: "" },
          labelIds: [],
          internalDate: "1700000000000",
          textPlain: "body",
        },
      ],
    };
    const oversized = {
      ...batch,
      upserts: [{ ...batch.upserts[0], textPlain: "x".repeat(2_000_001) }],
    };
    let releaseStorage;
    let storageAcquired;
    const acquired = new Promise((resolve) => {
      storageAcquired = resolve;
    });
    const storageLock = navigator.locks.request(
      "inbox-zero:local-mail-storage",
      () => {
        storageAcquired();
        return new Promise((resolve) => {
          releaseStorage = resolve;
        });
      },
    );
    await acquired;
    try {
      check(
        (await rpc({ command: "apply", request: batch })).error === "busy",
        "worker yields to a canonical storage commit",
      );
      check(
        (await rpc({ command: "reclaim", request })).error === "busy",
        "reclamation yields to a canonical storage commit",
      );
      check(
        (await rpc({ command: "state", emailAccountId: "cleanup" })).result
          .revision === 0,
        "storage contention does not advance the checkpoint",
      );
    } finally {
      releaseStorage();
      await storageLock;
    }
    check(
      (await rpc({ command: "apply", request: oversized })).error ===
        "document-too-large",
      "explicit capacity error",
    );
    check(
      (await rpc({ command: "state", emailAccountId: "cleanup" })).result
        .revision === 0,
      "capacity error leaves revision pending",
    );
    check(
      (await rpc({ command: "apply", request: batch })).result === true,
      "worker apply",
    );
    check(
      (
        await rpc({
          command: "reclaim",
          request: { ...request, generation: "stale" },
        })
      ).result === false,
      "stale reclamation fenced",
    );
    check(
      (await rpc({ command: "reclaim", request })).result.incrementalVacuum,
      "account scoped reclamation supported",
    );
    check(
      (await rpc({ command: "accounts" })).result.accounts.length === 1,
      "account discovery",
    );
    check(
      (
        await rpc({
          command: "deleteAccount",
          request: { emailAccountId: "cleanup", generation: "stale" },
        })
      ).result === false,
      "stale cleanup fenced",
    );
    check(
      (await rpc({ command: "deleteAccount", request })).result === true,
      "account cleanup",
    );
    check(
      (await rpc({ command: "accounts" })).result.accounts.length === 0,
      "account identity removed",
    );
    check(
      (await rpc({ command: "reset", request })).result === true,
      "account can reinitialize",
    );
    check(
      (await rpc({ command: "clearAll" })).result === true,
      "active file cleanup",
    );
    check(
      (await rpc({ command: "reset", request })).error === "unavailable",
      "late writes fenced after clear",
    );
    worker.terminate();
    const root = await navigator.storage.getDirectory();
    let missing = false;
    try {
      await root.getDirectoryHandle(".mail-search");
    } catch (error) {
      missing = error.name === "NotFoundError";
    }
    check(missing, "database directory physically removed");
    const stale = await root.getDirectoryHandle(".mail-search", {
      create: true,
    });
    await stale.getFileHandle("stale", { create: true });
    worker = new Worker("/production.js", { type: "module" });
    check(
      (await rpc({ command: "clearAll" })).result === true,
      "cleanup without index initialization",
    );
    worker.terminate();
    missing = false;
    try {
      await root.getDirectoryHandle(".mail-search");
    } catch (error) {
      missing = error.name === "NotFoundError";
    }
    check(missing, "unopened cache physically removed");
    return "passed";
  });
  const result = {
    browser: await browser.version(),
    regression,
    reclamation,
    storageLimit,
    reopen,
    stagedReplacement,
    cleanup,
    benchmark,
  };
  console.log(JSON.stringify(result, null, 2));
  if (process.env.SEARCH_INDEX_REPORT)
    await writeFile(
      process.env.SEARCH_INDEX_REPORT,
      JSON.stringify(result, null, 2),
    );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
  await rm(output, { recursive: true, force: true });
}
