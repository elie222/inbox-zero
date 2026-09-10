import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import {
  createQuotaLedger,
  createQuotaProxy,
  gmailMethod,
} from "./quota-proxy.mjs";

test("weighted quota expires and accounts share the project budget", () => {
  let now = 0;
  const ledger = createQuotaLedger(
    { userUnits: 40, projectUnits: 60 },
    () => now,
  );
  const first = ledger.admit("threads.get", "one");
  first.release();
  assert.equal(
    ledger.admit("labels.list", "one").event.reason,
    "userRateLimitExceeded",
  );
  ledger.admit("messages.get", "two").release();
  assert.equal(
    ledger.admit("labels.list", "three").event.reason,
    "rateLimitExceeded",
  );
  now = 60_000;
  assert.equal(ledger.admit("threads.get", "one").event.reason, null);
});

test("concurrency is held until completion and failed admissions do not spend quota", () => {
  const ledger = createQuotaLedger({ concurrency: 1, userUnits: 80 });
  const first = ledger.admit("threads.get");
  assert.equal(ledger.admit("threads.get").event.status, 429);
  first.release();
  first.release();
  const next = ledger.admit("threads.get");
  assert.equal(next.event.reason, null);
  next.release();
  assert.equal(
    ledger.admit("threads.get").event.reason,
    "userRateLimitExceeded",
  );
});

test("HTTP batch meters each part, returns partial errors, and counts response bytes", async () => {
  const upstream = createServer((_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ id: "thread", messages: [] }));
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const proxy = await createQuotaProxy({
    upstream: `http://127.0.0.1:${upstream.address().port}`,
    options: { userUnits: 40, latencyMs: 0 },
  });
  try {
    const response = await fetch(`${proxy.url}/batch/gmail/v1`, {
      method: "POST",
      body: "--batch\nContent-Type: application/http\n\nGET /gmail/v1/users/me/threads/a\n\n--batch\nContent-Type: application/http\n\nGET /gmail/v1/users/me/threads/b\n\n--batch--",
    });
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.match(body, /HTTP\/1.1 200 OK/);
    assert.match(body, /HTTP\/1.1 403 Error/);
    assert.match(body, /userRateLimitExceeded/);
    assert.equal(proxy.ledger.events.length, 2);
    assert.ok(proxy.ledger.events[0].bytes > 0);
    assert.equal(proxy.ledger.events[1].bytes, 0);
  } finally {
    await proxy.close();
    await new Promise((resolve) => upstream.close(resolve));
  }
});

test("concurrency belongs to a mailbox, not the whole project", () => {
  const ledger = createQuotaLedger({ concurrency: 1 });
  const first = ledger.admit("threads.get", "one");
  const second = ledger.admit("threads.get", "two");
  assert.equal(second.event.reason, null);
  assert.equal(ledger.admit("threads.get", "one").event.status, 429);
  first.release();
  second.release();
});

test("classifies settings, attachments and query-bearing batch requests", () => {
  assert.equal(
    gmailMethod("GET", "/gmail/v1/users/me/settings/filters"),
    "settings.filters.list",
  );
  assert.equal(
    gmailMethod("GET", "/gmail/v1/users/me/messages/a/attachments/b"),
    "messages.attachments.get",
  );
  assert.equal(
    gmailMethod("GET", "/gmail/v1/users/me/threads/a?format=metadata"),
    "threads.get",
  );
  assert.equal(
    gmailMethod("POST", "/gmail/v1/users/me/messages/batchModify"),
    "messages.batchModify",
  );
});

test("batch request targets cannot escape the local upstream", async () => {
  const proxy = await createQuotaProxy({ upstream: "http://127.0.0.1:1" });
  try {
    const response = await fetch(`${proxy.url}/batch/gmail/v1`, {
      method: "POST",
      body: "--batch\nContent-Type: application/http\n\nGET https://example.com/gmail/v1/users/me/threads/a\n\n--batch--",
    });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: "Simulation request failed",
    });
    const diagnostics = await fetch(`${proxy.url}/__simulation`).then(
      (result) => result.json(),
    );
    assert.equal(diagnostics.harnessErrors.length, 1);
    assert.equal(proxy.ledger.events.length, 0);
  } finally {
    await proxy.close();
  }
});
