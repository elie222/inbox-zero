import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";

// Published May 2026 schedule. Existing projects may have different quotas.
// https://developers.google.com/workspace/gmail/api/reference/quota
export const QUOTA_COSTS = {
  "threads.list": 10,
  "threads.get": 40,
  "threads.modify": 10,
  "threads.trash": 20,
  "threads.untrash": 10,
  "threads.delete": 20,
  "messages.list": 5,
  "messages.get": 20,
  "messages.modify": 5,
  "messages.batchModify": 50,
  "messages.batchDelete": 50,
  "messages.trash": 20,
  "messages.untrash": 5,
  "messages.delete": 10,
  "messages.send": 100,
  "messages.attachments.get": 20,
  "drafts.list": 5,
  "drafts.get": 20,
  "drafts.create": 10,
  "drafts.update": 15,
  "drafts.delete": 10,
  "drafts.send": 100,
  "labels.list": 1,
  "labels.get": 1,
  "labels.create": 5,
  "labels.update": 5,
  "labels.delete": 5,
  "history.list": 2,
  getProfile: 1,
  watch: 100,
  stop: 50,
  "settings.sendAs.list": 1,
  "settings.filters.list": 1,
  "settings.forwardingAddresses.list": 1,
};

export function gmailMethod(method, path) {
  const parts = new URL(path, "http://localhost").pathname.split("/");
  const userIndex = parts.indexOf("users");
  if (userIndex < 0 || !parts.includes("gmail")) return null;
  const [resource, id, action, attachmentId] = parts.slice(userIndex + 2);
  if (resource === "profile") return "getProfile";
  if (["watch", "stop"].includes(resource)) return resource;
  if (
    resource === "settings" &&
    ["sendAs", "filters", "forwardingAddresses"].includes(id) &&
    !action
  )
    return `settings.${id}.list`;
  if (resource === "history") return "history.list";
  if (action === "attachments" && attachmentId)
    return "messages.attachments.get";
  if (action) return `${resource}.${action}`;
  if (["batchModify", "batchDelete", "send"].includes(id))
    return `${resource}.${id}`;
  let operation = "create";
  if (method === "GET") operation = id ? "get" : "list";
  else if (method === "DELETE") operation = "delete";
  else if (["PUT", "PATCH"].includes(method)) operation = "update";
  return `${resource}.${operation}`;
}

export function createQuotaLedger(options = {}, now = Date.now) {
  const config = {
    userUnits: 6000,
    projectUnits: 1_200_000,
    windowMs: 60_000,
    concurrency: 8,
    latencyMs: 250,
    bytesPerSecond: 2_000_000,
    ...options,
  };
  let usage = [];
  const activeByUser = new Map();
  const events = [];
  return {
    config,
    events,
    admit(method, user = "mailbox") {
      const time = now();
      usage = usage.filter((entry) => entry.time > time - config.windowMs);
      const cost = QUOTA_COSTS[method];
      if (cost === undefined)
        throw new Error(`Unmodelled Gmail method: ${method}`);
      const userUsage = usage
        .filter((entry) => entry.user === user)
        .reduce((sum, entry) => sum + entry.cost, 0);
      const projectUsage = usage.reduce((sum, entry) => sum + entry.cost, 0);
      const active = activeByUser.get(user) ?? 0;
      let reason = null;
      let status = 0;
      if (active >= config.concurrency) {
        reason = "concurrentLimitExceeded";
        status = 429;
      } else if (userUsage + cost > config.userUnits) {
        reason = "userRateLimitExceeded";
        status = 403;
      } else if (projectUsage + cost > config.projectUnits) {
        reason = "rateLimitExceeded";
        status = 403;
      }
      const event = {
        time,
        method,
        user,
        cost,
        reason,
        active,
        bytes: 0,
        status,
      };
      events.push(event);
      if (reason) return { event, release() {} };
      usage.push({ time, cost, user });
      activeByUser.set(user, active + 1);
      event.active = active + 1;
      let released = false;
      return {
        event,
        release() {
          if (!released) {
            activeByUser.set(user, activeByUser.get(user) - 1);
            released = true;
          }
        },
      };
    },
    reset(options = {}) {
      if ([...activeByUser.values()].some((count) => count > 0))
        throw new Error("Wait for in-flight Gmail requests before resetting");
      Object.assign(config, options);
      usage = [];
      events.length = 0;
    },
  };
}

export async function createQuotaProxy({ upstream, port = 0, options }) {
  if (
    !["127.0.0.1", "localhost", "[::1]"].includes(new URL(upstream).hostname)
  ) {
    throw new Error("Simulation upstream must be local");
  }
  const ledger = createQuotaLedger(options);
  const harnessErrors = [];
  const server = createServer(async (req, res) => {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      if (req.url === "/__simulation") {
        if (req.method === "POST")
          ledger.reset(JSON.parse(body.toString() || "{}"));
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            config: ledger.config,
            events: ledger.events,
            harnessErrors,
          }),
        );
        return;
      }
      const headers = { ...req.headers };
      for (const key of [
        "host",
        "content-length",
        "connection",
        "accept-encoding",
      ])
        delete headers[key];
      const response = req.url.startsWith("/batch")
        ? await batch(body.toString(), headers)
        : await forward(req.method, req.url, headers, body);
      res.writeHead(response.status, response.headers);
      res.end(response.body);
    } catch (error) {
      if (req.url === "/__simulation") {
        res.writeHead(409, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: String(error) }));
        return;
      }
      harnessErrors.push(String(error));
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: String(error) }));
    }
  });
  async function forward(method, path, headers, body) {
    const target = new URL(path, upstream);
    if (target.origin !== new URL(upstream).origin) {
      throw new Error("Simulation requests must stay on the local upstream");
    }
    const name = gmailMethod(method, path);
    const admission = name ? ledger.admit(name) : null;
    const event = admission?.event;
    if (event?.reason) {
      const seconds = Math.ceil(ledger.config.windowMs / 1000);
      return {
        status: event.status,
        headers: {
          "content-type": "application/json",
          "retry-after": String(seconds),
        },
        body: Buffer.from(
          JSON.stringify({
            error: {
              code: event.status,
              message: `${event.reason}. Retry after ${new Date(Date.now() + seconds * 1000).toISOString()}`,
              errors: [{ domain: "usageLimits", reason: event.reason }],
            },
          }),
        ),
      };
    }
    try {
      if (name) await delay(ledger.config.latencyMs);
      const response = await fetch(target, {
        method,
        headers,
        body:
          ["GET", "HEAD"].includes(method) || !body?.length ? undefined : body,
        redirect: "manual",
      });
      const bytes = Buffer.from(await response.arrayBuffer());
      if (event) {
        event.bytes = bytes.length;
        event.status = response.status;
        await delay((bytes.length / ledger.config.bytesPerSecond) * 1000);
        event.durationMs = Date.now() - event.time;
      }
      const responseHeaders = Object.fromEntries(response.headers);
      for (const key of [
        "content-encoding",
        "content-length",
        "transfer-encoding",
        "connection",
      ])
        delete responseHeaders[key];
      return { status: response.status, headers: responseHeaders, body: bytes };
    } finally {
      admission?.release();
    }
  }
  async function batch(body, headers) {
    const requests = [
      ...body.matchAll(
        /^(GET|POST|PUT|PATCH|DELETE) (\S+)(?: HTTP\/1\.[01])?\r?$/gm,
      ),
    ];
    if (!requests.length) throw new Error("Unrecognized Gmail batch body");
    // The app currently batches GETs only. Fail rather than silently mis-model writes.
    if (requests.some((match) => match[1] !== "GET"))
      throw new Error("Simulation only supports GET batch parts");
    const responses = await Promise.all(
      requests.map((match) => forward(match[1], match[2], headers)),
    );
    const boundary = "simulation_batch";
    const parts = responses.map(
      (response, index) =>
        `--${boundary}\r\nContent-Type: application/http\r\nContent-ID: <response-${index}>\r\n\r\nHTTP/1.1 ${response.status} ${response.status === 200 ? "OK" : "Error"}\r\nContent-Type: application/json\r\n${response.headers["retry-after"] ? `Retry-After: ${response.headers["retry-after"]}\r\n` : ""}\r\n${response.body.toString()}\r\n`,
    );
    return {
      status: 200,
      headers: { "content-type": `multipart/mixed; boundary=${boundary}` },
      body: Buffer.from(`${parts.join("")}--${boundary}--\r\n`),
    };
  }
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    ledger,
    close: () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  };
}
