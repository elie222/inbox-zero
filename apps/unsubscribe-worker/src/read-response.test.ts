import { test } from "node:test";
import assert from "node:assert/strict";
import { readResponse } from "./read-response.ts";

test("cancels an oversized streaming response before buffering subsequent data", async () => {
  let cancelled = false;
  const body = new ReadableStream({
    pull(controller) {
      controller.enqueue(new Uint8Array(1024));
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(
    readResponse(new Response(body), 100),
    /Response too large/,
  );
  assert.equal(cancelled, true);
});
