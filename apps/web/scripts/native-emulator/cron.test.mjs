import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const stackPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "stack.mjs",
);

test("scheduled-actions timer calls the cron route with the bearer secret", async () => {
  let resolveHit = () => {};
  const hit = new Promise((resolve) => {
    resolveHit = resolve;
  });
  const server = createServer((request, response) => {
    resolveHit({
      url: request.url,
      authorization: request.headers.authorization,
    });
    response.writeHead(200);
    response.end("{}");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address === "object");
  const child = spawn(process.execPath, [stackPath, "serve-cron"], {
    env: {
      ...process.env,
      NATIVE_EMULATOR_BASE_URL: `http://127.0.0.1:${address.port}`,
      CRON_SECRET: "native-emulator-cron",
    },
    stdio: "ignore",
  });

  try {
    const request = await Promise.race([
      hit,
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("scheduled-actions timer did not call")),
          5000,
        ),
      ),
    ]);
    assert.equal(request.url, "/api/cron/scheduled-actions");
    assert.equal(request.authorization, "Bearer native-emulator-cron");
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => server.close(resolve));
  }
});
