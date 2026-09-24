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
import { assertLocalTargets } from "./endpoints.mjs";
import {
  createResponseLossControl,
  createResponseLossProxy,
} from "./response-loss-proxy.mjs";

const webRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const statePath = path.join(webRoot, ".tmp/native-emulator/state.json");
const composeFile = path.join(webRoot, "scripts/native-emulator/compose.yml");

const command = process.argv[2] ?? "help";

if (command === "serve-proxy") {
  await serveProxy();
} else if (command === "up") {
  await up({ foreground: process.argv.includes("--foreground") });
} else if (command === "down") {
  await down();
} else if (command === "smoke") {
  await smoke();
} else {
  console.log("Usage: node scripts/native-emulator/stack.mjs <up|down|smoke>");
  process.exit(command === "help" ? 0 : 1);
}

async function up({ foreground }) {
  if (exists(statePath)) {
    throw new Error(
      "Native emulator is already running. Stop it with: pnpm -F inbox-zero-ai native-emulator:down",
    );
  }
  assertInheritedTargets();
  const id = `${process.pid}${Date.now()}`;
  const runDir = path.join(webRoot, ".tmp/native-emulator", id);
  mkdirSync(runDir, { recursive: true });
  const ports = {
    next: await getAvailablePort(),
    postgres: await getAvailablePort(),
    redis: await getAvailablePort(),
    redisHttp: await getAvailablePort(),
    googleUpstream: await getAvailablePort(),
    microsoftUpstream: await getAvailablePort(),
    google: await getAvailablePort(),
    microsoft: await getAvailablePort(),
    control: await getAvailablePort(),
    email: await getAvailablePort(),
    stripe: await getAvailablePort(),
    llm: await getAvailablePort(),
  };
  const baseUrl = `http://127.0.0.1:${ports.next}`;
  const googleBaseUrl = `http://127.0.0.1:${ports.google}`;
  const microsoftBaseUrl = `http://127.0.0.1:${ports.microsoft}`;
  const controlUrl = `http://127.0.0.1:${ports.control}`;
  const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${ports.postgres}/native_emulator`;
  const redisUrl = `redis://127.0.0.1:${ports.redis}`;
  const env = appEnv({
    baseUrl,
    googleBaseUrl,
    microsoftBaseUrl,
    databaseUrl,
    redisUrl,
    redisHttpUrl: `http://127.0.0.1:${ports.redisHttp}`,
    emailUrl: `http://127.0.0.1:${ports.email}`,
    stripeUrl: `http://127.0.0.1:${ports.stripe}`,
    llmUrl: `http://127.0.0.1:${ports.llm}`,
  });
  assertLocalTargets(env);
  const composeProject = `iznative${id}`;
  const pids = [];
  const state = {
    baseUrl,
    controlUrl,
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
        "--native",
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
          String(ports.googleUpstream),
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
          String(ports.microsoftUpstream),
          "--base-url",
          microsoftBaseUrl,
          "--seed",
          seedPath,
        ],
        env,
        path.join(runDir, "microsoft.log"),
      ),
      spawnLogged(
        process.execPath,
        [fileURLToPath(import.meta.url), "serve-proxy"],
        {
          ...env,
          NATIVE_EMULATOR_GOOGLE_UPSTREAM: `http://127.0.0.1:${ports.googleUpstream}`,
          NATIVE_EMULATOR_MICROSOFT_UPSTREAM: `http://127.0.0.1:${ports.microsoftUpstream}`,
          NATIVE_EMULATOR_GOOGLE_PORT: String(ports.google),
          NATIVE_EMULATOR_MICROSOFT_PORT: String(ports.microsoft),
          NATIVE_EMULATOR_CONTROL_PORT: String(ports.control),
        },
        path.join(runDir, "proxy.log"),
      ),
      spawnLogged(
        "node",
        ["__tests__/playwright/email-server.mjs", String(ports.email)],
        env,
        path.join(runDir, "email.log"),
      ),
      spawnLogged(
        "pnpm",
        ["exec", "tsx", "scripts/run-stripe-emulator.ts", String(ports.stripe)],
        {
          ...env,
          STRIPE_EMULATOR_WEBHOOK_URL: `${baseUrl}/api/stripe/webhook`,
        },
        path.join(runDir, "stripe.log"),
      ),
      spawnLogged(
        "pnpm",
        ["exec", "tsx", "scripts/run-llm-emulator.ts", String(ports.llm)],
        env,
        path.join(runDir, "llm.log"),
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
    if (foreground) await waitForSignal(state);
  } catch (error) {
    await down(state);
    throw error;
  }
}

async function serveProxy() {
  const google = await createResponseLossProxy({
    upstream: process.env.NATIVE_EMULATOR_GOOGLE_UPSTREAM,
    port: Number(process.env.NATIVE_EMULATOR_GOOGLE_PORT),
  });
  const microsoft = await createResponseLossProxy({
    upstream: process.env.NATIVE_EMULATOR_MICROSOFT_UPSTREAM,
    port: Number(process.env.NATIVE_EMULATOR_MICROSOFT_PORT),
  });
  const control = await createResponseLossControl({
    port: Number(process.env.NATIVE_EMULATOR_CONTROL_PORT),
    proxies: { google, microsoft },
  });
  console.log(`response-loss control ${control.url}`);
  await new Promise(() => {});
}

async function smoke() {
  await up({ foreground: false });
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  try {
    const auth = await fetch(`${state.baseUrl}/api/auth/ok`);
    if (!auth.ok) throw new Error(`/api/auth/ok returned ${auth.status}`);
    const google = await fetch(
      `${state.googleBaseUrl}/.well-known/openid-configuration`,
    );
    if (!google.ok)
      throw new Error(`Google emulator returned ${google.status}`);
    const microsoft = await fetch(
      `${state.microsoftBaseUrl}/.well-known/openid-configuration`,
    );
    if (!microsoft.ok) {
      throw new Error(`Microsoft emulator returned ${microsoft.status}`);
    }
    const health = await fetch(`${state.controlUrl}/health`);
    if (!health.ok) throw new Error(`control health returned ${health.status}`);
    const armed = await fetch(`${state.controlUrl}/response-loss`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "both", count: 0 }),
    });
    if (!armed.ok)
      throw new Error(`response-loss control returned ${armed.status}`);
    console.log("native emulator smoke passed");
  } finally {
    await down();
  }
  if (exists(statePath)) throw new Error("state file survived teardown");
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
  console.log(`CONTROL_URL=${state.controlUrl}`);
  console.log(`GOOGLE_BASE_URL=${state.googleBaseUrl}`);
  console.log(`MICROSOFT_BASE_URL=${state.microsoftBaseUrl}`);
}

async function waitForReady(state) {
  await waitFor(`${state.controlUrl}/health`, "response-loss control");
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
  emailUrl,
  stripeUrl,
  llmUrl,
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
    AUTH_SECRET: "native-emulator-secret",
    GOOGLE_CLIENT_ID: "emulate-google-client.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "emulate-google-secret",
    GOOGLE_BASE_URL: googleBaseUrl,
    MICROSOFT_CLIENT_ID: "emulate-microsoft-client-id",
    MICROSOFT_CLIENT_SECRET: "emulate-microsoft-secret",
    MICROSOFT_BASE_URL: microsoftBaseUrl,
    MICROSOFT_WEBHOOK_CLIENT_STATE: "native-emulator-webhook",
    GOOGLE_PUBSUB_TOPIC_NAME: "native-emulator-topic",
    GOOGLE_PUBSUB_VERIFICATION_TOKEN: "native-emulator-token",
    EMAIL_ENCRYPT_SECRET: "native-emulator-secret",
    EMAIL_ENCRYPT_SALT: "native-emulator-salt",
    INTERNAL_API_KEY: "native-emulator-internal",
    API_KEY_SALT: "native-emulator-api-key-salt",
    DEFAULT_LLMS: "openai-compatible:emulated",
    ECONOMY_LLMS: "",
    CHAT_LLMS: "",
    NANO_LLMS: "",
    DRAFT_LLMS: "",
    OPENAI_COMPATIBLE_BASE_URL: `${llmUrl}/v1`,
    OPENAI_API_KEY: "",
    ANTHROPIC_API_KEY: "",
    OPENROUTER_API_KEY: "",
    AI_GATEWAY_API_KEY: "",
    REDIS_URL: redisUrl,
    REDIS_HTTP_URL: redisHttpUrl,
    REDIS_HTTP_TOKEN: "native-emulator-token",
    UPSTASH_REDIS_URL: "",
    UPSTASH_REDIS_TOKEN: "",
    QSTASH_TOKEN: "",
    QSTASH_CURRENT_SIGNING_KEY: "",
    QSTASH_NEXT_SIGNING_KEY: "",
    RESEND_API_KEY: "native-emulator-email",
    RESEND_BASE_URL: emailUrl,
    RESEND_AUDIENCE_ID: "native-emulator-audience",
    RESEND_FROM_EMAIL: "Inbox Zero <signin@example.com>",
    LOOPS_API_SECRET: "",
    STRIPE_API_BASE_URL: stripeUrl,
    STRIPE_SECRET_KEY: "native-emulator-stripe",
    STRIPE_WEBHOOK_SECRET: "whsec_native_emulator",
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
