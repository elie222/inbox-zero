import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer, request } from "node:http";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("proxy keeps a fixed destination and loses only a completed metadata reply", {
  timeout: 5000,
}, async () => {
  let forwarded = 0;
  let foreign = 0;
  const upstream = createServer((incoming, response) => {
    forwarded += 1;
    incoming.resume();
    incoming.on("end", () => response.writeHead(200).end("completed"));
  });
  const second = createServer((_incoming, response) => {
    foreign += 1;
    response.end("foreign");
  });
  const upstreamPort = await listen(upstream);
  const foreignPort = await listen(second);
  const allocator = createServer();
  const port = await listen(allocator);
  await close(allocator);
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(new URL("./native-proxy.mjs", import.meta.url)),
      String(port),
      `http://127.0.0.1:${upstreamPort}`,
    ],
    { stdio: "ignore" },
  );
  const exited = once(child, "exit");
  const send = (path, method = "GET", body = "") =>
    new Promise((resolve, reject) => {
      const outgoing = request(
        {
          hostname: "127.0.0.1",
          port,
          path,
          method,
          headers: { "content-type": "application/json" },
        },
        (response) => {
          let data = "";
          response.on("data", (bytes) => {
            data += bytes;
          });
          response.on("end", () =>
            resolve({ status: response.statusCode, data }),
          );
        },
      );
      outgoing.on("error", reject);
      outgoing.end(body);
    });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try {
        await send("/__native-control/response-loss");
        ready = true;
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }
    assert.equal(ready, true);
    for (const path of [
      `//127.0.0.1:${foreignPort}/private`,
      `http://127.0.0.1:${foreignPort}/private`,
    ]) {
      assert.equal((await send(path)).status, 400);
    }
    assert.equal(foreign, 0);
    assert.equal(forwarded, 0);
    assert.equal((await send("/ordinary")).status, 200);
    await send(
      "/__native-control/response-loss",
      "POST",
      JSON.stringify({ provider: "google", count: 1 }),
    );
    const body = JSON.stringify({
      operation: { intent: { kind: "metadata" } },
    });
    const operation = "/api/mail/v1/accounts/a/operations/op";
    await assert.rejects(send(operation, "PUT", body));
    assert.equal(
      JSON.parse((await send("/__native-control/response-loss")).data).dropped,
      1,
    );
    assert.equal((await send(operation, "PUT", body)).status, 200);
    assert.equal(foreign, 0);
    assert.equal(forwarded, 3);
  } finally {
    child.kill("SIGTERM");
    await exited;
    await close(upstream);
    await close(second);
  }
});

function listen(server) {
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve(server.address().port)),
  );
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}
