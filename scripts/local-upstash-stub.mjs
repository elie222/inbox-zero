/**
 * Tiny Upstash-compatible Redis HTTP stub for local Thunderbird bridge testing.
 * Run: node scripts/local-upstash-stub.mjs
 * Listens on http://127.0.0.1:8079 with token "dev_token"
 */
import http from "node:http";

const PORT = Number(process.env.REDIS_HTTP_PORT || 8079);
const TOKEN = process.env.UPSTASH_REDIS_TOKEN || "dev_token";

/** @type {Map<string, unknown>} */
const store = new Map();
/** @type {Map<string, string[]>} */
const lists = new Map();
/** @type {Map<string, Map<string, string>>} */
const hashes = new Map();

function unauthorized(res) {
  res.writeHead(401, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Unauthorized" }));
}

function ok(res, result) {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ result }));
}

function runCommand(parts) {
  const [cmd, ...args] = parts;
  const command = String(cmd || "").toUpperCase();

  switch (command) {
    case "PING":
      return "PONG";
    case "GET": {
      return store.get(args[0]) ?? null;
    }
    case "SET": {
      const [key, value, maybeEx, seconds] = args;
      store.set(key, value);
      if (String(maybeEx).toUpperCase() === "EX" && seconds) {
        setTimeout(() => store.delete(key), Number(seconds) * 1000).unref?.();
      }
      return "OK";
    }
    case "DEL": {
      let count = 0;
      for (const key of args) {
        if (store.delete(key) || lists.delete(key) || hashes.delete(key)) {
          count += 1;
        }
      }
      return count;
    }
    case "EXPIRE": {
      const [key, seconds] = args;
      setTimeout(() => {
        store.delete(key);
        lists.delete(key);
        hashes.delete(key);
      }, Number(seconds) * 1000).unref?.();
      return 1;
    }
    case "RPUSH": {
      const [key, ...values] = args;
      const list = lists.get(key) || [];
      list.push(...values.map(String));
      lists.set(key, list);
      return list.length;
    }
    case "LPUSH": {
      const [key, ...values] = args;
      const list = lists.get(key) || [];
      list.unshift(...values.map(String).reverse());
      lists.set(key, list);
      return list.length;
    }
    case "LTRIM": {
      const [key, start, stop] = args;
      const list = lists.get(key) || [];
      const s = Number(start);
      const e = Number(stop);
      const trimmed = e === -1 ? list.slice(s) : list.slice(s, e + 1);
      lists.set(key, trimmed);
      return "OK";
    }
    case "LRANGE": {
      const [key, start, stop] = args;
      const list = lists.get(key) || [];
      const s = Number(start);
      const e = Number(stop);
      if (e === -1) return list.slice(s);
      return list.slice(s, e + 1);
    }
    case "HSET": {
      const [key, ...fieldValues] = args;
      const hash = hashes.get(key) || new Map();
      for (let i = 0; i < fieldValues.length; i += 2) {
        hash.set(String(fieldValues[i]), String(fieldValues[i + 1]));
      }
      hashes.set(key, hash);
      return fieldValues.length / 2;
    }
    case "HGET": {
      const [key, field] = args;
      return hashes.get(key)?.get(String(field)) ?? null;
    }
    case "HGETALL": {
      const hash = hashes.get(args[0]);
      if (!hash) return {};
      return Object.fromEntries(hash.entries());
    }
    default:
      throw new Error(`Unsupported command: ${command}`);
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    });
    res.end();
    return;
  }

  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (token !== TOKEN) {
    unauthorized(res);
    return;
  }

  try {
    if (req.method === "POST") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks).toString("utf8");
      const parsed = JSON.parse(body);
      // Upstash pipeline: [[cmd, ...args], ...] or single [cmd, ...args]
      if (Array.isArray(parsed) && Array.isArray(parsed[0])) {
        const results = parsed.map((parts) => ({ result: runCommand(parts) }));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(results));
        return;
      }
      ok(res, runCommand(parsed));
      return;
    }

    if (req.method === "GET" && req.url) {
      // /get/key or /ping style paths used by some clients
      const path = decodeURIComponent(req.url.replace(/^\//, ""));
      const parts = path.split("/").filter(Boolean);
      ok(res, runCommand(parts));
      return;
    }

    res.writeHead(405);
    res.end("Method not allowed");
  } catch (error) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: String(error) }));
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Local Upstash stub on http://127.0.0.1:${PORT} (token=${TOKEN})`);
});
