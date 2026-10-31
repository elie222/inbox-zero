import { createServer, request as httpRequest } from "node:http";

const port = Number(process.argv[2]);
const upstream = new URL(process.argv[3]);
if (upstream.protocol !== "http:" || upstream.hostname !== "127.0.0.1") {
  throw new Error("Test proxy upstream must stay on loopback");
}
const PROVIDERS = new Set(["google", "microsoft"]);
const KINDS = new Set(["metadata", "send", "draft", "any"]);
const MAX_COUNT = 100;
const OPERATION_PATH =
  /^\/api\/mail\/v1\/accounts\/([^/]+)\/operations\/[^/]+$/;
const DRAFT_PATH = /^\/api\/user\/drafts(?:\/[^/]+)?$/;

let loss = { provider: "google", kind: "metadata" };
let remaining = 0;
let dropped = 0;
const accountProviders = new Map();

const server = createServer(async (request, response) => {
  const chunks = [];
  try {
    for await (const chunk of request) chunks.push(chunk);
  } catch {
    response.destroy();
    return;
  }
  const body = Buffer.concat(chunks);
  if (request.url === "/__test-control/response-loss") {
    if (request.method === "POST") {
      const intent = parseLossIntent(body);
      if (!intent) {
        response.writeHead(400).end();
        return;
      }
      loss = { provider: intent.provider, kind: intent.kind };
      remaining = intent.count;
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
  const drop = await shouldDrop(request, target.pathname, body);
  const outgoing = httpRequest(
    upstream,
    {
      method: request.method,
      path: target.pathname + target.search,
      headers: { ...request.headers, host: upstream.host },
    },
    (result) => {
      if (drop) {
        // Drain the real server reply before disconnecting the client.
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

function parseLossIntent(body) {
  let intent;
  try {
    intent = JSON.parse(body.toString());
  } catch {
    return null;
  }
  const kind = intent?.kind ?? "metadata";
  if (
    !PROVIDERS.has(intent?.provider) ||
    !Number.isInteger(intent?.count) ||
    intent.count < 1 ||
    intent.count > MAX_COUNT ||
    !KINDS.has(kind)
  ) {
    return null;
  }
  return { provider: intent.provider, count: intent.count, kind };
}

async function shouldDrop(request, pathname, body) {
  if (remaining === 0) return false;
  const write = lossCandidate(request, pathname, body);
  if (!write || (loss.kind !== "any" && loss.kind !== write.kind)) return false;
  const provider = await accountProvider(write.accountId, request.headers);
  if (provider !== loss.provider || remaining === 0) return false;
  remaining -= 1;
  return true;
}

function lossCandidate(request, pathname, body) {
  const operation = OPERATION_PATH.exec(pathname);
  if (request.method === "PUT" && operation) {
    let kind;
    try {
      kind = JSON.parse(body.toString()).operation.intent.kind;
    } catch {
      return null;
    }
    return { kind, accountId: decodeURIComponent(operation[1]) };
  }
  const accountId = request.headers["x-email-account-id"];
  if (
    (request.method === "POST" || request.method === "PUT") &&
    DRAFT_PATH.test(pathname) &&
    typeof accountId === "string"
  ) {
    return { kind: "draft", accountId };
  }
  return null;
}

async function accountProvider(accountId, headers) {
  if (accountProviders.has(accountId)) return accountProviders.get(accountId);
  const lookupHeaders = {};
  for (const name of ["cookie", "authorization"]) {
    if (headers[name]) lookupHeaders[name] = headers[name];
  }
  try {
    const response = await fetch(
      new URL("/api/user/email-accounts", upstream),
      {
        headers: lookupHeaders,
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) return null;
    const { emailAccounts } = await response.json();
    for (const emailAccount of emailAccounts ?? []) {
      accountProviders.set(emailAccount.id, emailAccount.account?.provider);
    }
  } catch {
    return null;
  }
  return accountProviders.get(accountId) ?? null;
}
