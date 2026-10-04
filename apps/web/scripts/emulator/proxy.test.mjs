import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer, request } from "node:http";
import { connect } from "node:net";
import { createInterface } from "node:readline";
import { test } from "vitest";
import { fileURLToPath } from "node:url";

test("proxy keeps a fixed destination and loses only a completed metadata reply", async () => {
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
  const { child, port, exited } = await startProxy(upstreamPort);
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
    assert.equal(
      (await send("/__test-control/response-loss", "POST", "{")).status,
      400,
    );
    assert.equal((await send("/__test-control/response-loss")).status, 200);
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
      "/__test-control/response-loss",
      "POST",
      JSON.stringify({ provider: "google", count: 1 }),
    );
    const body = JSON.stringify({
      operation: { intent: { kind: "metadata" } },
    });
    const operation = "/api/mail/v1/accounts/a/operations/op";
    await assert.rejects(send(operation, "PUT", body));
    assert.equal(
      JSON.parse((await send("/__test-control/response-loss")).data).dropped,
      1,
    );
    assert.equal((await send(operation, "PUT", body)).status, 200);
    assert.equal(foreign, 0);
    assert.equal(forwarded, 3);
  } finally {
    child.kill("SIGTERM");
    await bounded(exited);
    await close(upstream);
    await close(second);
  }
}, 5000);

test("proxy drains before closing a held incomplete connection within a bounded time", async () => {
  const upstream = createServer((_incoming, response) =>
    response.end("unused"),
  );
  const upstreamPort = await listen(upstream);
  const { child, port, exited } = await startProxy(upstreamPort);
  const socket = connect(port, "127.0.0.1");
  socket.on("error", () => {});
  try {
    await once(socket, "connect");
    socket.write(
      "POST /held HTTP/1.1\r\nHost: localhost\r\nContent-Length: 100\r\n\r\nx",
    );
    child.kill("SIGTERM");
    assert.deepEqual(await bounded(exited), [0, null]);
  } finally {
    socket.destroy();
    child.kill("SIGKILL");
    await close(upstream);
  }
}, 5000);

async function startProxy(upstreamPort) {
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(new URL("./proxy.mjs", import.meta.url)),
      "0",
      `http://127.0.0.1:${upstreamPort}`,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  const exited = once(child, "exit");
  const lines = createInterface({ input: child.stdout });
  try {
    const [line] = await bounded(
      Promise.race([
        once(lines, "line"),
        exited.then(() => {
          throw new Error("Proxy exited before reporting its port");
        }),
      ]),
    );
    const { port } = JSON.parse(line);
    assert.ok(Number.isInteger(port) && port > 0);
    return { child, port, exited };
  } catch (error) {
    child.kill("SIGKILL");
    await exited;
    throw error;
  } finally {
    lines.close();
  }
}

async function bounded(work) {
  let timer;
  try {
    return await Promise.race([
      work,
      new Promise((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("Proxy operation timed out")),
          2000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function listen(server) {
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve(server.address().port)),
  );
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}
