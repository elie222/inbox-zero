import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import {
  createResponseLossControl,
  createResponseLossProxy,
} from "./response-loss-proxy.mjs";

test("a successful write is applied upstream and then hidden from the client", async () => {
  const applied = [];
  const upstream = await listen((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      applied.push({
        method: request.method,
        body: Buffer.concat(chunks).toString("utf8"),
      });
      response.end(JSON.stringify({ id: "written" }));
    });
  });
  const proxy = await createResponseLossProxy({ upstream: upstream.url });
  proxy.arm(1);

  await assert.rejects(fetch(proxy.url, { method: "POST", body: "archive" }));
  assert.deepEqual(applied, [{ method: "POST", body: "archive" }]);
  const read = await fetch(proxy.url);
  assert.equal(read.status, 200);
  assert.deepEqual(proxy.status(), { remaining: 0, dropped: 1 });

  await proxy.close();
  await upstream.close();
});

test("failed writes do not consume a response-loss fault", async () => {
  const upstream = await listen((_request, response) => {
    response.statusCode = 401;
    response.end("unauthorized");
  });
  const proxy = await createResponseLossProxy({ upstream: upstream.url });
  proxy.arm(1);

  const response = await fetch(proxy.url, { method: "POST", body: "nope" });
  assert.equal(response.status, 401);
  assert.equal(proxy.status().remaining, 1);

  await proxy.close();
  await upstream.close();
});

test("the control server arms one provider at a time", async () => {
  const proxies = {
    google: fakeProxy(),
    microsoft: fakeProxy(),
  };
  const control = await createResponseLossControl({ proxies });

  const armed = await fetch(`${control.url}/response-loss`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider: "google", count: 2 }),
  });
  assert.equal(armed.status, 200);
  assert.equal(proxies.google.remaining, 2);
  assert.equal(proxies.microsoft.remaining, 0);

  const cleared = await fetch(`${control.url}/response-loss`, {
    method: "DELETE",
  });
  assert.equal(cleared.status, 200);
  assert.equal(proxies.google.remaining, 0);

  await control.close();
});

function fakeProxy() {
  return {
    remaining: 0,
    arm(count) {
      this.remaining = count;
    },
    status() {
      return { remaining: this.remaining, dropped: 0 };
    },
  };
}

function listen(handler) {
  const server = createServer(handler);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      resolve({
        url: `http://127.0.0.1:${server.address().port}`,
        close: () =>
          new Promise((done, fail) => {
            server.close((error) => (error ? fail(error) : done()));
          }),
      });
    });
  });
}
