import { createServer, request as httpRequest } from "node:http";

const port = Number(process.argv[2]);
const upstream = new URL(process.argv[3]);
if (upstream.protocol !== "http:" || upstream.hostname !== "127.0.0.1") {
  throw new Error("Native proxy upstream must stay on loopback");
}
let remaining = 0;
let dropped = 0;
const server = createServer(async (request, response) => {
  const chunks = [];
  try {
    for await (const chunk of request) chunks.push(chunk);
  } catch {
    response.destroy();
    return;
  }
  const body = Buffer.concat(chunks);
  if (request.url === "/__native-control/response-loss") {
    if (request.method === "POST") {
      let intent;
      try {
        intent = JSON.parse(body.toString());
      } catch {
        response.writeHead(400).end();
        return;
      }
      if (intent?.provider !== "google" || intent?.count !== 1) {
        response.writeHead(400).end();
        return;
      }
      remaining = 1;
      dropped = 0;
    } else if (request.method === "DELETE") {
      remaining = 0;
      dropped = 0;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ remaining, dropped }));
    return;
  }
  let target;
  try {
    target = new URL(request.url, upstream);
  } catch {
    response.writeHead(400).end();
    return;
  }
  if (target.origin !== upstream.origin) {
    response.writeHead(400).end();
    return;
  }
  let metadata = false;
  if (request.method === "PUT" && /\/operations\/[^/]+$/.test(request.url)) {
    try {
      metadata =
        JSON.parse(body.toString()).operation.intent.kind === "metadata";
    } catch {}
  }
  const drop = metadata && remaining > 0;
  if (drop) remaining -= 1;
  const outgoing = httpRequest(
    upstream,
    {
      method: request.method,
      path: target.pathname + target.search,
      headers: { ...request.headers, host: upstream.host },
    },
    (result) => {
      if (drop) {
        // Drain the real server reply before disconnecting the native caller.
        result.resume();
        result.on("end", () => {
          dropped += 1;
          response.destroy();
        });
      } else {
        response.writeHead(result.statusCode, result.headers);
        result.pipe(response);
      }
    },
  );
  outgoing.on("error", () => response.destroy());
  outgoing.end(body);
});
server.listen(port, "127.0.0.1", () => {
  console.log(JSON.stringify({ port: server.address().port }));
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    server.close(() => process.exit(0));
    const forceClose = setTimeout(() => server.closeAllConnections(), 500);
    forceClose.unref();
  });
}
