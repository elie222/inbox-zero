import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { delimiter, dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { promisify, parseArgs } from "node:util";
import { Client } from "pg";
import Redis from "ioredis";
import { createLlmEmulator } from "../__tests__/emulators/llm";
import { createStripeEmulator } from "../__tests__/emulators/stripe";
import { writeEmulateSeed } from "./emulate-seed";
import { createLocalEnvironment } from "./local-dev/environment";
import { acquireLocalLock } from "./local-dev/lock";
import { createProcessManager } from "./local-dev/processes";
import { createRedisHttpServer } from "./local-dev/redis-http";

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT_DIR = resolve(APP_DIR, "../..");
const DATA_DIR = resolve(ROOT_DIR, ".context/local-dev");
const PNPM = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const exec = promisify(execFile);
const allocatedPorts = new Set<number>();

main().catch((error) => {
  console.error(
    `[local] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});

async function main() {
  const { values } = parseArgs({
    options: {
      port: { type: "string", default: "3000" },
      backend: { type: "string", default: "auto" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    console.log(
      "Usage: pnpm local:start [--port 3000] [--backend auto|native|docker]\n\nRequires Node.js 24, pnpm, and either Docker Compose or native PostgreSQL and Redis.\nOn macOS: brew install postgresql@16 redis\nData is preserved in .context/local-dev or the checkout's Docker volume.\nPress Ctrl-C to stop the app and the services started by this command.",
    );
    return;
  }
  if (Number(process.versions.node.split(".")[0]) !== 24)
    throw new Error("Use Node.js 24, matching package.json engines.");
  if (process.platform === "win32")
    throw new Error(
      "Local development currently supports macOS and Linux. On Windows, run this command inside WSL.",
    );
  const appPort = Number(values.port);
  if (!Number.isInteger(appPort) || appPort < 1 || appPort > 65_535)
    throw new Error("--port must be an integer between 1 and 65535");
  if (!["auto", "native", "docker"].includes(values.backend))
    throw new Error("--backend must be auto, native, or docker");
  await assertAppPortFree(appPort);
  allocatedPorts.add(appPort);

  const native = Object.fromEntries(
    ["initdb", "postgres", "redis-server"].map((name) => [
      name,
      findExecutable(name),
    ]),
  );
  let backend = values.backend;
  if (backend === "auto")
    backend = Object.values(native).every(Boolean) ? "native" : "docker";
  if (backend === "native" && !Object.values(native).every(Boolean))
    throw new Error(
      "Native development requires initdb, postgres, and redis-server. On macOS: brew install postgresql@16 redis. Alternatively install Docker and use --backend docker.",
    );
  if (backend === "docker") {
    try {
      await exec("docker", ["compose", "version"], { timeout: 15_000 });
      await exec("docker", ["info"], { timeout: 15_000 });
    } catch {
      throw new Error(
        "Start Docker Desktop with Compose installed, or install PostgreSQL and Redis and use --backend native. On macOS: brew install postgresql@16 redis.",
      );
    }
  }

  mkdirSync(DATA_DIR, { recursive: true });
  const unlock = await acquireLocalLock(join(DATA_DIR, "launcher.pid"));
  const cleanup: { close: () => Promise<unknown>; timeout?: number }[] = [];
  let manager: ReturnType<typeof createProcessManager> | undefined;
  let interrupted = false;
  const interrupt = () => {
    interrupted = true;
    manager?.abort(new Error("Stopping local development"));
  };
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  try {
    const secretsPath = join(DATA_DIR, "secrets.json");
    if (!existsSync(secretsPath)) {
      writeFileSync(
        secretsPath,
        JSON.stringify({
          database: randomBytes(24).toString("hex"),
          auth: randomBytes(32).toString("hex"),
          encryption: randomBytes(32).toString("hex"),
          redis: randomBytes(32).toString("hex"),
        }),
        { mode: 0o600, flag: "wx" },
      );
    }
    const secrets = JSON.parse(readFileSync(secretsPath, "utf8"));
    const [
      databasePort,
      redisPort,
      redisHttpPort,
      googlePort,
      microsoftPort,
      llmPort,
      stripePort,
      emailPort,
    ] = await Promise.all(Array.from({ length: 8 }, () => availablePort()));
    const env = createLocalEnvironment({
      appPort,
      databasePort,
      redisPort,
      redisHttpPort,
      googlePort,
      microsoftPort,
      llmPort,
      stripePort,
      secrets,
      inherited: process.env,
    });
    // Give this launcher its own Next output and lock, separate from pnpm dev and Playwright.
    env.PLAYWRIGHT_RUN_ID = "local-dev";
    env.RESEND_API_KEY = "local-email-key";
    env.RESEND_BASE_URL = `http://127.0.0.1:${emailPort}`;
    env.RESEND_FROM_EMAIL = "Inbox Zero <signin@example.com>";
    env.RESEND_AUDIENCE_ID = "playwright-audience";
    manager = createProcessManager(APP_DIR, env);
    const processes = manager;

    if (backend === "native") {
      const postgresDir = join(DATA_DIR, "postgres");
      const passwordFile = join(DATA_DIR, "postgres-password");
      if (!existsSync(join(postgresDir, "PG_VERSION"))) {
        writeFileSync(passwordFile, secrets.database, { mode: 0o600 });
        try {
          await processes.run("PostgreSQL initialization", native.initdb!, [
            "-D",
            postgresDir,
            "-U",
            "postgres",
            "--auth=scram-sha-256",
            "--pwfile",
            passwordFile,
          ]);
        } finally {
          unlinkSync(passwordFile);
        }
      }
      processes.start("PostgreSQL", native.postgres!, [
        "-D",
        postgresDir,
        "-h",
        "127.0.0.1",
        "-p",
        String(databasePort),
      ]);
      processes.start("Redis", native["redis-server"]!, [
        "--bind",
        "127.0.0.1",
        "--port",
        String(redisPort),
        "--save",
        "",
        "--appendonly",
        "no",
      ]);
    } else {
      const project = `inboxzero-local-${createHash("sha256").update(ROOT_DIR).digest("hex").slice(0, 12)}`;
      const args = [
        "compose",
        "-p",
        project,
        "-f",
        join(ROOT_DIR, "docker-compose.local.yml"),
      ];
      const dockerEnv = {
        ...env,
        LOCAL_POSTGRES_PASSWORD: secrets.database,
        LOCAL_POSTGRES_PORT: String(databasePort),
        LOCAL_REDIS_PORT: String(redisPort),
      };
      cleanup.push({
        close: () =>
          exec("docker", [...args, "down"], {
            env: dockerEnv,
            timeout: 60_000,
          }),
        timeout: 65_000,
      });
      await exec("docker", [...args, "up", "-d"], {
        env: dockerEnv,
        timeout: 240_000,
        signal: processes.signal,
      });
    }

    const adminUrl = new URL(env.DATABASE_URL);
    adminUrl.pathname = "/postgres";
    await processes.ready("PostgreSQL", async () => {
      const client = new Client({
        connectionString: adminUrl.href,
        connectionTimeoutMillis: 2000,
        query_timeout: 5000,
      });
      try {
        await client.connect();
        await client.query("SELECT 1");
      } finally {
        await client.end();
      }
    });
    const client = new Client({
      connectionString: adminUrl.href,
      connectionTimeoutMillis: 2000,
      query_timeout: 5000,
    });
    await client.connect();
    try {
      const database = await client.query(
        "SELECT 1 FROM pg_database WHERE datname = 'inboxzero_local'",
      );
      if (!database.rowCount)
        await client.query("CREATE DATABASE inboxzero_local");
    } finally {
      await client.end();
    }
    await processes.run("Database migrations", PNPM, [
      "exec",
      "prisma",
      "migrate",
      "deploy",
    ]);
    await configureDemoOnboarding(env.DATABASE_URL);

    const redis = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      commandTimeout: 5000,
      retryStrategy: () => null,
    });
    cleanup.push({ close: async () => redis.disconnect() });
    await redis.connect();
    await redis.ping();
    const redisHttp = await createRedisHttpServer({
      redis,
      token: secrets.redis,
      port: redisHttpPort,
    });
    cleanup.push({ close: redisHttp.close });
    await processes.ready("Redis HTTP", () =>
      checkUrl(`${redisHttp.url}/health`, {
        authorization: `Bearer ${secrets.redis}`,
      }),
    );

    const seedPath = join(DATA_DIR, "seed.json");
    await writeEmulateSeed(seedPath, env.NEXT_PUBLIC_BASE_URL);
    for (const [service, port] of [
      ["google", googlePort],
      ["microsoft", microsoftPort],
    ] as const) {
      processes.start(`${service} emulator`, PNPM, [
        "exec",
        "emulate",
        "start",
        "--service",
        service,
        "--seed",
        seedPath,
        "--port",
        String(port),
      ]);
      await processes.ready(`${service} emulator`, () =>
        checkUrl(`http://localhost:${port}/.well-known/openid-configuration`),
      );
    }
    const llm = await createLlmEmulator({ port: llmPort });
    cleanup.push({ close: llm.close });
    const stripe = await createStripeEmulator({
      port: stripePort,
      secretKey: env.STRIPE_SECRET_KEY,
      webhookSecret: env.STRIPE_WEBHOOK_SECRET,
      webhookUrl: `${env.NEXT_PUBLIC_BASE_URL}/api/stripe/webhook`,
    });
    cleanup.push({ close: stripe.close });
    processes.start("Email emulator", process.execPath, [
      "__tests__/playwright/email-server.mjs",
      String(emailPort),
    ]);
    await processes.ready("Email emulator", () =>
      checkUrl(env.RESEND_BASE_URL),
    );
    writeFileSync(
      join(DATA_DIR, "runtime.json"),
      `${JSON.stringify(env, null, 2)}\n`,
      { mode: 0o600 },
    );
    processes.start("Next.js", PNPM, [
      "exec",
      "next",
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(appPort),
    ]);
    await processes.ready(
      "Next.js",
      () => checkUrl(`${env.NEXT_PUBLIC_BASE_URL}/api/auth/ok`),
      240_000,
    );
    console.log(
      `\n[local] Ready: ${env.NEXT_PUBLIC_BASE_URL}/mail\n[local] Sign in with Google: developer@example.com\n[local] Or Microsoft: developer@outlook.test\n[local] Mail, billing, email delivery, and AI use local emulators. AI responses are canned.\n[local] Data survives restarts. Press Ctrl-C to stop.\n`,
    );
    await delay(2 ** 31 - 1, undefined, { signal: processes.signal });
  } catch (error) {
    if (!interrupted) throw error;
  } finally {
    console.log("[local] Stopping services");
    for (const { close, timeout = 10_000 } of cleanup.reverse()) {
      const deadline = new AbortController();
      try {
        await Promise.race([
          close(),
          delay(timeout, undefined, { signal: deadline.signal }).then(() => {
            throw new Error("Cleanup timed out");
          }),
        ]);
      } catch (error) {
        console.error("[local] Cleanup failed", error);
        process.exitCode = 1;
      } finally {
        deadline.abort();
      }
    }
    try {
      await manager?.stop();
    } finally {
      unlock();
      process.removeListener("SIGINT", interrupt);
      process.removeListener("SIGTERM", interrupt);
    }
  }
}

async function configureDemoOnboarding(databaseUrl: string) {
  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 2000,
    query_timeout: 5000,
  });
  await client.connect();
  try {
    // OAuth must create users and accounts together; pre-created users cannot
    // sign in through providers that intentionally forbid linking by email.
    await client.query(`
      CREATE OR REPLACE FUNCTION local_dev_complete_onboarding() RETURNS trigger AS $$
      BEGIN
        NEW."completedOnboardingAt" := COALESCE(NEW."completedOnboardingAt", NOW());
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      DROP TRIGGER IF EXISTS local_dev_onboarding ON "User";
      CREATE TRIGGER local_dev_onboarding BEFORE INSERT ON "User"
      FOR EACH ROW WHEN (NEW.email IN ('developer@example.com', 'developer@outlook.test'))
      EXECUTE FUNCTION local_dev_complete_onboarding();
    `);
  } finally {
    await client.end();
  }
}

function findExecutable(name: string) {
  const directories = [
    ...(process.env.PATH ?? "").split(delimiter),
    "/opt/homebrew/opt/postgresql@16/bin",
    "/usr/local/opt/postgresql@16/bin",
  ];
  return directories
    .map((directory) => join(directory, name))
    .find((path) => existsSync(path));
}

function availablePort() {
  return new Promise<number>((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string")
        return reject(new Error("Could not allocate a local port"));
      server.close(() => {
        if (allocatedPorts.has(address.port)) {
          availablePort().then(resolvePort, reject);
          return;
        }
        allocatedPorts.add(address.port);
        resolvePort(address.port);
      });
    });
  });
}

async function assertAppPortFree(port: number) {
  const server = createServer();
  await new Promise<void>((resolvePort, reject) => {
    server.once("error", () =>
      reject(
        new Error(
          `Port ${port} is already in use. Stop that server or use pnpm local:start --port ${port + 1}.`,
        ),
      ),
    );
    server.listen(port, "127.0.0.1", () =>
      server.close((error) => (error ? reject(error) : resolvePort())),
    );
  });
}

async function checkUrl(url: string, headers?: Record<string, string>) {
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(2000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  await response.body?.cancel();
}
