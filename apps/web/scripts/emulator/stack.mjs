import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import {
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const statePath = path.join(webRoot, ".tmp/emulator/state.json");
const composeFile = path.join(webRoot, "scripts/emulator/compose.yml");
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

const command = process.argv[2] ?? "help";

if (command === "up") {
  await up({ foreground: process.argv.includes("--foreground") });
} else if (command === "down") {
  await down();
} else {
  console.log("Usage: node scripts/emulator/stack.mjs <up|down>");
  process.exit(command === "help" ? 0 : 1);
}

async function up({ foreground }) {
  if (exists(statePath)) {
    throw new Error(
      "Emulator is already running. Stop it with: pnpm -F inbox-zero-ai emulator:down",
    );
  }
  assertInheritedTargets();
  const id = `${process.pid}${Date.now()}`;
  const runDir = path.join(webRoot, ".tmp/emulator", id);
  mkdirSync(runDir, { recursive: true });
  const ports = {
    next: await getAvailablePort(),
    postgres: await getAvailablePort(),
    redis: await getAvailablePort(),
    redisHttp: await getAvailablePort(),
    google: await getAvailablePort(),
    microsoft: await getAvailablePort(),
  };
  const baseUrl = `http://127.0.0.1:${ports.next}`;
  const googleBaseUrl = `http://127.0.0.1:${ports.google}`;
  const microsoftBaseUrl = `http://127.0.0.1:${ports.microsoft}`;
  const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${ports.postgres}/emulator`;
  const env = appEnv({
    baseUrl,
    googleBaseUrl,
    microsoftBaseUrl,
    databaseUrl,
    redisUrl: `redis://127.0.0.1:${ports.redis}`,
    redisHttpUrl: `http://127.0.0.1:${ports.redisHttp}`,
  });
  assertLocalTargets(env);
  const composeProject = `emulator${id}`;
  const pids = [];
  const state = {
    baseUrl,
    googleBaseUrl,
    microsoftBaseUrl,
    databaseUrl,
    composeProject,
    composeEnv: {
      POSTGRES_PORT: String(ports.postgres),
      REDIS_PORT: String(ports.redis),
      REDIS_HTTP_PORT: String(ports.redisHttp),
    },
    runDir,
    pids,
  };
  try {
    compose(composeProject, ["up", "-d", "--wait"], state.composeEnv);
    run(webRoot, "pnpm", ["exec", "prisma", "migrate", "deploy"], env);
    const seedPath = path.join(runDir, "emulate.generated.json");
    run(
      webRoot,
      "pnpm",
      [
        "exec",
        "tsx",
        "scripts/write-emulate-seed.ts",
        "--teammates",
        "--base-url",
        baseUrl,
        "--output",
        seedPath,
      ],
      env,
    );
    pids.push(
      spawnLogged(
        "pnpm",
        [
          "exec",
          "emulate",
          "start",
          "--service",
          "google",
          "--port",
          String(ports.google),
          "--base-url",
          googleBaseUrl,
          "--seed",
          seedPath,
        ],
        env,
        path.join(runDir, "google.log"),
      ),
      spawnLogged(
        "pnpm",
        [
          "exec",
          "emulate",
          "start",
          "--service",
          "microsoft",
          "--port",
          String(ports.microsoft),
          "--base-url",
          microsoftBaseUrl,
          "--seed",
          seedPath,
        ],
        env,
        path.join(runDir, "microsoft.log"),
      ),
      spawnLogged(
        "pnpm",
        [
          "exec",
          "next",
          "dev",
          "--turbopack",
          "--hostname",
          "127.0.0.1",
          "--port",
          String(ports.next),
        ],
        env,
        path.join(runDir, "next.log"),
      ),
    );
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
    await waitForReady(state);
    printReady(state);
    if (foreground) await waitForSignal();
  } catch (error) {
    await down(state);
    throw error;
  }
}

async function down(state = readState()) {
  if (!state) return;
  for (const pid of state.pids ?? []) stopPid(pid);
  if (state.composeProject) {
    try {
      compose(
        state.composeProject,
        ["down", "--volumes", "--timeout", "10", "--remove-orphans"],
        state.composeEnv ?? {
          POSTGRES_PORT: "1",
          REDIS_PORT: "1",
          REDIS_HTTP_PORT: "1",
        },
      );
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
    }
  }
  rmSync(statePath, { force: true });
}

function readState() {
  if (!exists(statePath)) return;
  return JSON.parse(readFileSync(statePath, "utf8"));
}

function printReady(state) {
  console.log(`BASE_URL=${state.baseUrl}`);
  console.log(`GOOGLE_BASE_URL=${state.googleBaseUrl}`);
  console.log(`MICROSOFT_BASE_URL=${state.microsoftBaseUrl}`);
}

async function waitForReady(state) {
  await waitFor(
    `${state.googleBaseUrl}/.well-known/openid-configuration`,
    "Google emulator",
  );
  await waitFor(
    `${state.microsoftBaseUrl}/.well-known/openid-configuration`,
    "Microsoft emulator",
  );
  await waitFor(`${state.baseUrl}/api/auth/ok`, "Next auth", 180_000);
}

async function waitFor(url, name, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "not ready";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = `${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(500);
  }
  throw new Error(`${name} did not become ready at ${url}: ${lastError}`);
}

function appEnv({
  baseUrl,
  googleBaseUrl,
  microsoftBaseUrl,
  databaseUrl,
  redisUrl,
  redisHttpUrl,
}) {
  return {
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME ?? "",
    USER: process.env.USER ?? "",
    TMPDIR: process.env.TMPDIR ?? "/tmp",
    LANG: process.env.LANG ?? "C.UTF-8",
    NODE_ENV: "development",
    NODE_OPTIONS: "--max_old_space_size=6144",
    NEXT_PUBLIC_BASE_URL: baseUrl,
    DATABASE_URL: databaseUrl,
    DIRECT_URL: databaseUrl,
    PREVIEW_DATABASE_URL: databaseUrl,
    AUTH_SECRET: "local-emulator-secret",
    GOOGLE_CLIENT_ID: "emulate-google-client.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "emulate-google-secret",
    GOOGLE_BASE_URL: googleBaseUrl,
    MICROSOFT_CLIENT_ID: "emulate-microsoft-client-id",
    MICROSOFT_CLIENT_SECRET: "emulate-microsoft-secret",
    MICROSOFT_BASE_URL: microsoftBaseUrl,
    MICROSOFT_WEBHOOK_CLIENT_STATE: "local-emulator-webhook",
    GOOGLE_PUBSUB_TOPIC_NAME: "local-emulator-topic",
    GOOGLE_PUBSUB_VERIFICATION_TOKEN: "local-emulator-token",
    EMAIL_ENCRYPT_SECRET: "local-emulator-secret",
    EMAIL_ENCRYPT_SALT: "local-emulator-salt",
    INTERNAL_API_KEY: "local-emulator-internal",
    API_KEY_SALT: "local-emulator-api-key-salt",
    DEFAULT_LLMS: "openai-compatible:emulated",
    ECONOMY_LLMS: "",
    CHAT_LLMS: "",
    NANO_LLMS: "",
    DRAFT_LLMS: "",
    OPENAI_COMPATIBLE_BASE_URL: "",
    OPENAI_API_KEY: "",
    ANTHROPIC_API_KEY: "",
    OPENROUTER_API_KEY: "",
    AI_GATEWAY_API_KEY: "",
    REDIS_URL: redisUrl,
    REDIS_HTTP_URL: redisHttpUrl,
    REDIS_HTTP_TOKEN: "local-emulator-token",
    UPSTASH_REDIS_URL: "",
    UPSTASH_REDIS_TOKEN: "",
    QSTASH_TOKEN: "",
    QSTASH_CURRENT_SIGNING_KEY: "",
    QSTASH_NEXT_SIGNING_KEY: "",
    RESEND_API_KEY: "",
    LOOPS_API_SECRET: "",
    STRIPE_SECRET_KEY: "",
    STRIPE_WEBHOOK_SECRET: "",
    NEXT_PUBLIC_EMAIL_SEND_ENABLED: "true",
    NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS: "",
    NEXT_PUBLIC_POSTHOG_KEY: "",
    NEXT_PUBLIC_POSTHOG_API_HOST: "",
  };
}

function assertInheritedTargets() {
  const inherited = {};
  for (const key of [
    "DATABASE_URL",
    "DIRECT_URL",
    "PREVIEW_DATABASE_URL",
    "GOOGLE_BASE_URL",
    "MICROSOFT_BASE_URL",
    "NEXT_PUBLIC_BASE_URL",
    "REDIS_URL",
    "REDIS_HTTP_URL",
    "UPSTASH_REDIS_URL",
  ]) {
    if (process.env[key]) inherited[key] = process.env[key];
  }
  assertLocalTargets(inherited);
}

function assertLocalTargets(env) {
  for (const [key, value] of Object.entries(env)) {
    if (!value) continue;
    if (value.startsWith("postgres") || value.startsWith("redis:")) {
      assertLoopbackUrl(
        key,
        value.replace(/^postgres(?:ql)?:/, "http:").replace(/^redis:/, "http:"),
      );
      continue;
    }
    if (value.startsWith("http://") || value.startsWith("https://")) {
      assertLoopbackUrl(key, value);
    }
  }
}

function assertLoopbackUrl(key, value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${key} is not a URL: ${value}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${key} must use http on the local emulator`);
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error(
      `${key} must stay on loopback. Refusing to point the emulator at ${url.hostname}.`,
    );
  }
}

function compose(project, args, env) {
  const result = spawnSync(
    "docker",
    ["compose", "-p", project, "-f", composeFile, ...args],
    { cwd: webRoot, env: { ...process.env, ...env }, stdio: "inherit" },
  );
  if (result.status !== 0) {
    throw new Error(`docker compose ${args[0]} failed`);
  }
}

function run(cwd, command, args, env) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    stdio: "inherit",
  });
  if (result.status !== 0)
    throw new Error(`${command} ${args.join(" ")} failed`);
}

function spawnLogged(command, args, env, logPath) {
  const log = openSync(logPath, "a");
  const child = spawn(command, args, {
    cwd: webRoot,
    env,
    detached: true,
    stdio: ["ignore", log, log],
  });
  child.unref();
  if (!child.pid) throw new Error(`failed to start ${command}`);
  return child.pid;
}

function stopPid(pid) {
  signal(pid, "SIGTERM");
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (!alive(pid)) return;
    spawnSync("sleep", ["0.1"]);
  }
  signal(pid, "SIGKILL");
}

function signal(pid, name) {
  try {
    process.kill(-pid, name);
  } catch {
    try {
      process.kill(pid, name);
    } catch {
      // The process already exited.
    }
  }
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function waitForSignal() {
  return new Promise((resolve) => {
    const stop = () => {
      down().finally(resolve);
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}

function exists(file) {
  try {
    readFileSync(file);
    return true;
  } catch {
    return false;
  }
}

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
