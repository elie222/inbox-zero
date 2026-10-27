import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { createQuota } from "./quota.mjs";

export function createGateway({ apiKey, quota, fetchImpl = fetch, freeOnly = true, waitForMinute = false, waitImpl = delay }) {
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is required");
  return createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/health") {
      reply(response, 200, { ok: true, ...quota.status(), freeOnly });
      return;
    }
    if (request.headers.authorization !== `Bearer ${apiKey}`) {
      reply(response, 401, { error: { code: 401, message: "Invalid gateway credential" } });
      return;
    }
    if (request.method !== "POST" || request.url !== "/api/v1/chat/completions") {
      reply(response, 404, { error: { code: 404, message: "Only chat completions are enabled" } });
      return;
    }
    try {
      const chunks = [];
      let length = 0;
      for await (const chunk of request) {
        length += chunk.length;
        if (length > 10_000_000) {
          reply(response, 413, { error: { code: 413, message: "Request too large" } });
          return;
        }
        chunks.push(chunk);
      }
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        reply(response, 400, { error: { code: 400, message: "Invalid JSON request" } });
        return;
      }
      const models = [body?.model, ...(Array.isArray(body?.models) ? body.models : [])].filter(Boolean);
      if (!models.length || (freeOnly && (models.some((model) => typeof model !== "string" || !(model.endsWith(":free") || model === "openrouter/free")) || body.plugins?.length))) {
        reply(response, 403, { error: { code: 403, message: "This trial gateway permits free models only and no paid plugins" } });
        return;
      }
      const workload = request.headers["x-inbox-zero-workload"] === "backfill" ? "backfill" : "priority";
      let reservation = quota.reserve(undefined,workload);
      const queuedAt = Date.now();
      while (waitForMinute && !reservation.allowed && reservation.reason === "minute" && !response.destroyed && Date.now()-queuedAt < 120_000) {
        await waitImpl(Math.min(60_000, reservation.retryAfter * 1000 + 50));
        if (response.destroyed) return;
        reservation = quota.reserve(undefined,workload);
      }
      if (!reservation.allowed) {
        const daily = reservation.reason === "daily" || reservation.reason === "backfill";
        const code = daily ? 403 : 429;
        response.setHeader("Retry-After", reservation.retryAfter);
        reply(response, code, { error: { code, message: reservation.reason === "backfill" ? `Backlog allowance exhausted; ${reservation.newMailReserve} daily requests are protected for new mail. Resets at 00:00 UTC.` : daily ? `OpenRouter daily limit (${reservation.perDay} requests) reached. Resets at 00:00 UTC.` : `OpenRouter minute limit (${reservation.perMinute} requests) reached. Try again in ${reservation.retryAfter} seconds.` } });
        return;
      }
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), 180_000);
      response.once("close", () => abort.abort());
      try {
        const upstream = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "HTTP-Referer": "http://localhost:3000", "X-Title": "Inbox Zero Local" },
          body: JSON.stringify(body),
          signal: abort.signal,
        });
        response.statusCode = upstream.status;
        for (const name of ["content-type", "retry-after"]) {
          const value = upstream.headers.get(name);
          if (value) response.setHeader(name, value);
        }
        response.setHeader("Cache-Control", "no-store");
        if (upstream.body) await pipeline(Readable.fromWeb(upstream.body), response);
        else response.end();
      } finally {
        clearTimeout(timer);
      }
    } catch {
      // Do not log request bodies, authorization headers, or upstream errors.
      if (!response.headersSent) reply(response, 502, { error: { code: 502, message: "OpenRouter request failed. The attempt was counted conservatively." } });
      else response.destroy();
    }
  });
}

function reply(response, code, data) {
  response.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify(data));
}

async function main() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is required");
  const fingerprint = createHash("sha256").update(apiKey).digest("hex").slice(0, 16);
  const dbPath = resolve(`.context/openrouter/${fingerprint}.sqlite`);
  mkdirSync(dirname(dbPath), { recursive: true });
  const quota = createQuota(dbPath, {
    perMinute: Number(process.env.OPENROUTER_REQUESTS_PER_MINUTE ?? 20),
    perDay: Number(process.env.OPENROUTER_REQUESTS_PER_DAY ?? 50),
    newMailReserve: Math.min(100,Number(process.env.OPENROUTER_REQUESTS_PER_DAY ?? 50)),
  });
  async function syncUsage() {
   try {
    const result = await fetch("https://openrouter.ai/api/v1/key", { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(15_000) });
    if (!result.ok) throw new Error("Key validation failed");
    const { data } = await result.json();
    quota.syncDailyFloor(data?.free_model_daily_requests?.used);
   } catch {
    console.warn("[OpenRouter] Could not sync upstream usage; persistent local limits remain enforced.");
   }
  }
  await syncUsage();
  const syncTimer = setInterval(syncUsage, 60_000);
  syncTimer.unref();
  const server = createGateway({ apiKey, quota, freeOnly: process.env.OPENROUTER_FREE_ONLY !== "false", waitForMinute: true });
  server.requestTimeout = 30_000;
  server.listen(3010, "127.0.0.1", () => console.log(`[OpenRouter] Quota gateway ready at http://127.0.0.1:3010 (${quota.status().perMinute}/batch, ${quota.status().perDay}/UTC day)`));
  server.on("error", () => { console.error("[OpenRouter] Gateway could not start; check port 3010."); process.exitCode = 1; quota.close(); });
  server.on("close", () => clearInterval(syncTimer));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error("[OpenRouter] Gateway startup failed"); process.exitCode = 1; });
}
