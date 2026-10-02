import { afterEach, expect, test, vi } from "vitest";
import { Redis as HttpRedis } from "@upstash/redis";
import type Redis from "ioredis";
import { createRedisHttpServer } from "./redis-http";

const servers: Awaited<ReturnType<typeof createRedisHttpServer>>[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

test("round-trips strings, nested arrays, numbers, and null through the real Upstash client", async () => {
  const server = await startServer([
    [null, "שלום 世界"],
    [null, ["OK", "hello", ["nested", 3], null]],
    [null, 4],
    [null, null],
  ]);
  const redis = new HttpRedis({ url: server.url, token: "local-token" });
  const pipeline = redis.pipeline();
  pipeline.get("unicode");
  pipeline.lrange("list", 0, -1);
  pipeline.incr("counter");
  pipeline.get("missing");
  expect(await pipeline.exec()).toEqual([
    "שלום 世界",
    ["OK", "hello", ["nested", 3], null],
    4,
    null,
  ]);
});

test("requires the token and rejects malformed command bodies before running Redis commands", async () => {
  const call = vi.fn();
  const server = await startServer([], call);
  const unauthorized = await fetch(server.url, {
    method: "POST",
    body: '["PING"]',
  });
  expect(unauthorized.status).toBe(401);
  for (const body of ["not json", "null", '["GET", {"key":"value"}]']) {
    const response = await fetch(server.url, {
      method: "POST",
      headers: { authorization: "Bearer local-token" },
      body,
    });
    expect(response.status).toBe(400);
  }
  expect(call).not.toHaveBeenCalled();
});

test("uses a Redis transaction for multi-exec and returns command errors", async () => {
  const multi = vi.fn(() => ({
    call: vi.fn(),
    exec: async () => [[new Error("WRONGTYPE"), null]],
  }));
  const server = await createRedisHttpServer({
    redis: { multi } as unknown as Redis,
    token: "local-token",
  });
  servers.push(server);
  const response = await fetch(`${server.url}/multi-exec`, {
    method: "POST",
    headers: { authorization: "Bearer local-token" },
    body: '[["GET", "key"]]',
  });
  expect(multi).toHaveBeenCalledOnce();
  expect(await response.json()).toEqual([{ error: "WRONGTYPE" }]);
});

async function startServer(results: unknown[], call = vi.fn()) {
  const server = await createRedisHttpServer({
    redis: {
      pipeline: () => ({ call, exec: async () => results }),
    } as unknown as Redis,
    token: "local-token",
  });
  servers.push(server);
  return server;
}
