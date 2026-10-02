import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import type Redis from "ioredis";

export async function createRedisHttpServer({
  redis,
  token,
  port = 0,
}: {
  redis: Redis;
  token: string;
  port?: number;
}) {
  const server = createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.headers.authorization !== `Bearer ${token}`) {
      response.writeHead(401).end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    try {
      if (request.method === "GET" && request.url === "/health") {
        response.end(JSON.stringify({ result: await redis.ping() }));
        return;
      }
      if (
        request.method !== "POST" ||
        !["/", "/pipeline", "/multi-exec"].includes(request.url ?? "")
      ) {
        response.writeHead(404).end(JSON.stringify({ error: "Not found" }));
        return;
      }
      const body: unknown = JSON.parse(await readBody(request));
      const batched = request.url !== "/";
      const commands = batched ? body : [body];
      if (!Array.isArray(commands) || !commands.every(isCommand)) {
        response
          .writeHead(400)
          .end(JSON.stringify({ error: "Expected Redis command arrays" }));
        return;
      }
      const pipeline =
        request.url === "/multi-exec" ? redis.multi() : redis.pipeline();
      for (const [command, ...args] of commands)
        pipeline.call(command, ...args);
      const results = await pipeline.exec();
      if (!results) throw new Error("Redis returned no pipeline results");
      const replies = results.map(([error, result]) =>
        error
          ? { error: error.message }
          : {
              result:
                request.headers["upstash-encoding"] === "base64"
                  ? encodeResult(result)
                  : result,
            },
      );
      response.end(JSON.stringify(batched ? replies : replies[0]));
    } catch (error) {
      response.writeHead(400).end(
        JSON.stringify({
          error: error instanceof Error ? error.message : "Invalid request",
        }),
      );
    }
  });
  server.requestTimeout = 10_000;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}

function isCommand(value: unknown): value is [string, ...(string | number)[]] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    typeof value[0] === "string" &&
    value.every((arg) => typeof arg === "string" || typeof arg === "number")
  );
}

function encodeResult(value: unknown, topLevel = true): unknown {
  if (Array.isArray(value))
    return value.map((item) => encodeResult(item, false));
  if (typeof value === "string" && !(topLevel && value === "OK"))
    return Buffer.from(value).toString("base64");
  return value;
}

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 1024 * 1024) throw new Error("Request exceeds 1 MiB");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}
