import { createServer, request as sendRequest } from "node:http";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function createResponseLossProxy({ upstream, port = 0 }) {
  let remaining = 0;
  let dropped = 0;
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const target = new URL(request.url ?? "/", upstream);
      const { connection: _connection, ...rest } = request.headers;
      const headers = { ...rest, host: target.host };
      const outbound = sendRequest(
        target,
        { method: request.method, headers },
        (upstreamResponse) => {
          const payload = [];
          upstreamResponse.on("data", (chunk) => payload.push(chunk));
          upstreamResponse.on("end", () => {
            const status = upstreamResponse.statusCode ?? 502;
            const applied = status >= 200 && status < 300;
            if (
              applied &&
              MUTATING_METHODS.has(request.method ?? "") &&
              remaining > 0
            ) {
              remaining -= 1;
              dropped += 1;
              request.socket.destroy();
              return;
            }
            response.writeHead(status, upstreamResponse.headers);
            response.end(Buffer.concat(payload));
          });
        },
      );
      outbound.on("error", () => {
        if (response.headersSent) return;
        response.statusCode = 502;
        response.end();
      });
      outbound.end(Buffer.concat(chunks));
    });
  });
  await listen(server, port);
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    arm(count) {
      remaining = count;
    },
    status() {
      return { remaining, dropped };
    },
    close() {
      return closeServer(server);
    },
  };
}

export async function createResponseLossControl({ port = 0, proxies }) {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    response.setHeader("Content-Type", "application/json");
    if (request.method === "GET" && url.pathname === "/health") {
      response.end(
        JSON.stringify({ ok: true, providers: Object.keys(proxies) }),
      );
      return;
    }
    if (url.pathname !== "/response-loss") {
      response.statusCode = 404;
      response.end(JSON.stringify({ error: "not found" }));
      return;
    }
    if (request.method === "GET" || request.method === "DELETE") {
      if (request.method === "DELETE") {
        for (const proxy of Object.values(proxies)) proxy.arm(0);
      }
      response.end(JSON.stringify(snapshot(proxies)));
      return;
    }
    if (request.method !== "POST") {
      response.statusCode = 405;
      response.end(JSON.stringify({ error: "method not allowed" }));
      return;
    }
    const body = await readJson(request);
    const providers =
      body.provider === "both" ? Object.keys(proxies) : [body.provider];
    const count = Number(body.count ?? 1);
    if (!Number.isInteger(count) || count < 0) {
      response.statusCode = 400;
      response.end(
        JSON.stringify({ error: "count must be a non-negative integer" }),
      );
      return;
    }
    for (const provider of providers) {
      const proxy = proxies[provider];
      if (!proxy) {
        response.statusCode = 400;
        response.end(
          JSON.stringify({ error: `unknown provider: ${provider}` }),
        );
        return;
      }
      proxy.arm(count);
    }
    response.end(JSON.stringify(snapshot(proxies)));
  });
  await listen(server, port);
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close() {
      return closeServer(server);
    },
  };
}

function snapshot(proxies) {
  return Object.fromEntries(
    Object.entries(proxies).map(([provider, proxy]) => [
      provider,
      proxy.status(),
    ]),
  );
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(text ? JSON.parse(text) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}
