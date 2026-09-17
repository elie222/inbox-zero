import { createServer } from "node:http";
import { mkdtemp, readFile, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "@playwright/test";

const directory = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(directory, "../../..");
const require = createRequire(import.meta.url);
const output = await mkdtemp(path.join(tmpdir(), "mail-index-client-"));
await build({
  entryPoints: {
    client: path.join(directory, "client-page.ts"),
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
  path.join(
    path.dirname(require.resolve("@sqlite.org/sqlite-wasm/package.json")),
    "dist/sqlite3.wasm",
  ),
  path.join(output, "sqlite3.wasm"),
);
const server = createServer(async (req, res) => {
  const files = {
    "/client.js": "client.js",
    "/search-index.worker.ts": "production.js",
    "/sqlite3.wasm": "sqlite3.wasm",
  };
  const name = files[new URL(req.url, "http://localhost").pathname];
  if (req.url === "/") {
    res.end(
      '<!doctype html><title>Mail index client</title><script type="module" src="/client.js"></script>',
    );
    return;
  }
  if (!name) {
    res.writeHead(404).end();
    return;
  }
  try {
    res.setHeader(
      "Content-Type",
      name.endsWith(".wasm") ? "application/wasm" : "text/javascript",
    );
    res.end(await readFile(path.join(output, name)));
  } catch {
    res.writeHead(500).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch();
  const context = await browser.newContext();
  const pages = [await context.newPage(), await context.newPage()];
  let created = 0;
  let maxAlive = 0;
  const alive = new Set();
  const ownerPages = [];
  for (const page of pages) {
    page.on("worker", (worker) => {
      created++;
      alive.add(worker);
      maxAlive = Math.max(maxAlive, alive.size);
      ownerPages.push(page);
      worker.on("close", () => alive.delete(worker));
    });
  }
  for (const page of pages) {
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => window.indexClientTest);
  }
  assert.equal(created, 0, "inert client creates no worker");
  assert.deepEqual(
    await pages[0].evaluate(() => window.indexClientTest.state()),
    { error: "stale" },
  );
  assert.equal(created, 0, "assistant-only request creates no worker");
  await pages[0].evaluate(() => window.indexClientTest.activate());
  await pages[0].evaluate(() => window.indexClientTest.blockStorage());
  const denied = await pages[0].evaluate(() => window.indexClientTest.reset());
  assert.equal(
    denied.error,
    "unavailable",
    "initial schema creation is bounded before allocation",
  );
  const deniedAllocation = await pages[0].evaluate(() =>
    window.indexClientTest.storageLedger(),
  );
  assert.equal(
    deniedAllocation.bytes,
    0,
    "denied fresh schema initialization allocates no database pages",
  );
  await pages[0].evaluate(() => window.indexClientTest.restoreStorage());
  assert.deepEqual(
    await pages[0].evaluate(() => window.indexClientTest.reset()),
    { result: true },
  );
  assert.deepEqual(
    await pages[1].evaluate(() => window.indexClientTest.apply()),
    { result: true },
  );
  const allocation = await pages[0].evaluate(() =>
    window.indexClientTest.storageLedger(),
  );
  assert.equal(allocation.status, "ready");
  assert.ok(allocation.bytes > 0, "actual SQLite allocation is accounted");
  assert.equal(
    allocation.pending,
    undefined,
    "completed writes release reservation",
  );
  const results = await Promise.all(
    pages.map((page) => page.evaluate(() => window.indexClientTest.search())),
  );
  for (const result of results)
    assert.equal(result.result.messages[0].id, "message");
  assert.equal(
    created,
    2,
    "two tabs share one OPFS worker after initialization retry",
  );
  const owner = ownerPages.at(-1);
  const survivor = pages.find((page) => page !== owner);
  await owner.evaluate(() => window.indexClientTest.blockStorage());
  await owner.close();
  const recovered = await survivor.evaluate(() =>
    window.indexClientTest.search(),
  );
  assert.equal(
    recovered.result.messages[0].id,
    "message",
    "owner death recovers persisted reads without demanding growth headroom",
  );
  assert.equal(created, 3);
  assert.equal(maxAlive, 1, "no overlapping workers during handoff");
  await survivor.evaluate(() => window.indexClientTest.removeSource());
  assert.deepEqual(
    await survivor.evaluate(() => window.indexClientTest.search()),
    { error: "stale" },
  );
  assert.deepEqual(
    await survivor.evaluate(() => window.indexClientTest.cleanup()),
    { result: true },
  );
  assert.deepEqual(
    await survivor.evaluate(() => window.indexClientTest.client.clearAll()),
    { result: true },
  );
  assert.deepEqual(
    await survivor.evaluate(() => window.indexClientTest.storageLedger()),
    { status: "ready", bytes: 0 },
    "physical cleanup settles shared index allocation",
  );
  await survivor.evaluate(() => window.indexClientTest.client.close());
  console.log(
    JSON.stringify({
      browser: await browser.version(),
      assertions: "passed",
      workersCreated: created,
      maxConcurrentWorkers: maxAlive,
    }),
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
  await rm(output, { recursive: true, force: true });
}
