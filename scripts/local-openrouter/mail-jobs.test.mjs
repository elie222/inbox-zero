import assert from "node:assert/strict";
import test from "node:test";
import { runMailJobsOnce } from "./mail-jobs.mjs";

test("uses the authenticated local scheduler independently of AI requests", async () => {
  let calls = 0;
  const result = await runMailJobsOnce({ secret: "test-secret", fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, "http://127.0.0.1:3000/api/cron/scheduled-actions");
    assert.equal(options.headers.authorization, "Bearer test-secret");
    assert(options.signal instanceof AbortSignal);
    return Response.json({ processed: 1 });
  }});
  assert.equal(calls, 1);
  assert.deepEqual(result, { processed: 1 });
});

test("never starts anonymous scheduler requests", async () => {
  await assert.rejects(runMailJobsOnce({ secret: "", fetchImpl: () => { throw new Error("must not request"); } }), /requires CRON_SECRET/);
});

test("reports a wrong app or unavailable server for retry", async () => {
  await assert.rejects(runMailJobsOnce({ secret: "test-secret", fetchImpl: async () => new Response(null, { status: 404 }) }), /HTTP 404/);
});
