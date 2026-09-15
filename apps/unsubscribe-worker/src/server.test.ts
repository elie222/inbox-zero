import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { attachServer } from "./server.ts";
import { UnsubscribeService } from "./service.ts";

test("job and decision credentials cannot be interchanged, and private CONNECT targets are refused", async () => {
  let token = "";
  let release = () => {};
  const service = new UnsubscribeService({
    adapter: {
      create: async () => ({
        run: async (input) => {
          token = input.token;
          await new Promise<void>((resolve) => {
            release = resolve;
          });
          return { status: "needs_user" };
        },
        destroy: async () => {},
      }),
    },
    brokerUrl: "https://broker.example.com",
    brokerIp: "8.8.8.8",
    maxConcurrent: 1,
    decide: async () => ({ action: "needs_user", ref: null, option: null }),
  });
  // HTTP exercises routing locally; production entry point only constructs TLS servers.
  const server = createServer();
  attachServer(server, {
    service,
    apiKey: "master-secret",
    brokerIp: "8.8.8.8",
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}`;
  const job = {
    jobId: randomUUID(),
    url: "https://example.com",
    recipientEmail: "user@example.com",
  };
  const post = (path: string, secret: string, body: unknown) =>
    fetch(url + path, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  const active = service.execute(job);
  await new Promise((resolve) => setImmediate(resolve));
  try {
    assert.equal((await post("/jobs", token, job)).status, 401);
    assert.equal(
      (await post("/decision", "master-secret", { text: "", controls: [] }))
        .status,
      400,
    );
    assert.equal(
      (await post("/decision", token, { text: "", controls: [] })).status,
      200,
    );
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(url, {
        method: "CONNECT",
        path: "127.0.0.1:443",
        headers: {
          "Proxy-Authorization": `Basic ${Buffer.from(`job:${token}`).toString("base64")}`,
        },
      });
      req.on("connect", (response, socket) => {
        socket.destroy();
        resolve(response.statusCode);
      });
      req.on("error", reject);
      req.end();
    });
    assert.equal(status, 403);
  } finally {
    release();
    await active;
    service.shutdown();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
