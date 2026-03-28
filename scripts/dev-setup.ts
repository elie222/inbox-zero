import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, resolve } from "node:path";
import { spawn } from "node:child_process";
import net from "node:net";

type AuthMode = "emulate" | "real";
type Command = "init" | "dev" | "exec" | "clean";
type DbMode = "clone-main" | "empty";
type UrlMode = "conductor" | "localhost" | "portless";

type CliOptions = {
  authMode?: AuthMode;
  dbMode?: DbMode;
  explicitPort?: number;
  forceReset?: boolean;
  portlessName?: string;
  skipInit?: boolean;
  urlMode?: UrlMode;
};

type CliConfig = {
  command: Command;
  commandArgs: string[];
  options: CliOptions;
};

type WorktreeState = {
  authMode: AuthMode;
  baseUrl: string;
  branch: string;
  dbMode: DbMode;
  dbName: string;
  googleBaseUrl?: string;
  googleEmulatorPort?: number;
  microsoftBaseUrl?: string;
  microsoftEmulatorPort?: number;
  port: number;
  portlessName?: string;
  repoName: string;
  urlMode: UrlMode;
  version: 1;
};

class CommandExecutionError extends Error {
  exitCode?: number;
  signal?: NodeJS.Signals;

  constructor(
    message: string,
    options?: { exitCode?: number; signal?: NodeJS.Signals },
  ) {
    super(message);
    this.name = "CommandExecutionError";
    this.exitCode = options?.exitCode;
    this.signal = options?.signal;
  }
}

const ROOT_DIR = process.cwd();
const APP_DIR = resolve(ROOT_DIR, "apps/web");
const CONTEXT_DIR = resolve(ROOT_DIR, ".context");
const EMULATE_TEMPLATE_PATH = resolve(ROOT_DIR, "emulate.config.yaml");
const GENERATED_EMULATE_CONFIG_PATH = resolve(
  CONTEXT_DIR,
  "worktree-emulate.config.yaml",
);
const SHARED_ENV_DIR = resolve(homedir(), ".config/inbox-zero");
const SHARED_ENV_LOCAL_PATH = resolve(SHARED_ENV_DIR, ".env.local");
const SHARED_ENV_TEST_PATH = resolve(SHARED_ENV_DIR, ".env.test");
const SHARED_ENV_E2E_PATH = resolve(SHARED_ENV_DIR, ".env.e2e");
const STATE_PATH = resolve(CONTEXT_DIR, "dev-setup.json");
const LOCAL_DATABASE_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
const LOCAL_REDIS_HOST = "127.0.0.1";
const LOCAL_REDIS_HTTP_PORT = 8079;
const LOCAL_REDIS_PORT = 6380;
const LOCAL_REDIS_TOKEN = "dev_token";
const WORKTREE_DATABASE_PREFIX = "inboxzero_wt_";
const APP_ENV_LINKS = [
  {
    required: true,
    source: SHARED_ENV_LOCAL_PATH,
    target: resolve(APP_DIR, ".env.local"),
  },
  {
    required: false,
    source: SHARED_ENV_TEST_PATH,
    target: resolve(APP_DIR, ".env.test"),
  },
  {
    required: false,
    source: SHARED_ENV_E2E_PATH,
    target: resolve(APP_DIR, ".env.e2e"),
  },
];
const EMULATED_GOOGLE_CLIENT_ID =
  "emulate-google-client.apps.googleusercontent.com";
const EMULATED_GOOGLE_CLIENT_SECRET = "emulate-google-secret";
const EMULATED_MICROSOFT_CLIENT_ID = "emulate-microsoft-client-id";
const EMULATED_MICROSOFT_CLIENT_SECRET = "emulate-microsoft-secret";

main();

async function main() {
  try {
    const cli = parseCli(process.argv.slice(2));

    switch (cli.command) {
      case "init": {
        const state = await ensureWorktreeReady(cli.options);
        printStateSummary("Initialized dev setup", state);
        break;
      }
      case "dev": {
        const state = cli.options.skipInit
          ? await resolveWorktreeState(cli.options)
          : await ensureWorktreeReady(cli.options);

        await runDev(state);
        break;
      }
      case "exec": {
        if (!cli.commandArgs.length) {
          throw new Error("Provide a command after `pnpm dev-setup exec --`.");
        }

        const state = cli.options.skipInit
          ? await resolveWorktreeState(cli.options)
          : await ensureWorktreeReady(cli.options);

        await runCommand(cli.commandArgs[0], cli.commandArgs.slice(1), {
          cwd: ROOT_DIR,
          env: buildRuntimeEnv(state),
        });
        break;
      }
      case "clean": {
        await cleanWorktree();
        break;
      }
    }
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Unknown dev setup script error",
    );
    process.exit(getErrorExitCode(error));
  }
}

async function ensureWorktreeDatabase(
  state: WorktreeState,
  localEnv: Record<string, string>,
  forceReset: boolean,
) {
  const sourceDatabaseUrl = resolveTemplateDatabaseUrl(localEnv);

  assertSafeLocalDatabaseUrl(sourceDatabaseUrl);
  assertSafeWorktreeDatabaseName(state.dbName);

  const sourceDatabaseName = getDatabaseName(sourceDatabaseUrl);
  if (sourceDatabaseName === state.dbName) {
    throw new Error("Refusing to reuse the template database as the branch database.");
  }

  const adminUrl = toCliDatabaseUrl(sourceDatabaseUrl, "postgres");
  const targetDatabaseUrl = toCliDatabaseUrl(sourceDatabaseUrl, state.dbName);
  const dumpSourceUrl = toCliDatabaseUrl(sourceDatabaseUrl);

  if (forceReset) {
    await dropDatabase(adminUrl, state.dbName);
  }

  const databaseExists = await checkDatabaseExists(adminUrl, state.dbName);

  if (state.dbMode === "empty") {
    if (databaseExists) {
      log(`Resetting database ${state.dbName} for empty mode`);
      await dropDatabase(adminUrl, state.dbName);
    }

    await createDatabase(adminUrl, state.dbName);
  } else if (!databaseExists) {
    await createDatabase(adminUrl, state.dbName);

    if (state.dbMode === "clone-main") {
      log(`Cloning database into ${state.dbName}`);
      await runShellCommand(
        `pg_dump ${shellQuote(dumpSourceUrl)} | psql ${shellQuote(targetDatabaseUrl)}`,
      );
    }
  }

  log(`Running Prisma migrations against ${state.dbName}`);
  await runCommand("pnpm", ["prisma:migrate:local"], {
    cwd: APP_DIR,
    env: buildRuntimeEnv(state),
  });
}

async function runDev(state: WorktreeState) {
  printStateSummary("Starting dev setup", state);

  const childProcesses: Array<ReturnType<typeof spawn>> = [];
  const registerChild = (child: ReturnType<typeof spawn>) => {
    childProcesses.push(child);
    return child;
  };
  const cleanupChildren = () => {
    for (const child of childProcesses) {
      if (child.killed) continue;
      child.kill("SIGTERM");
    }
  };

  process.on("SIGINT", cleanupChildren);
  process.on("SIGTERM", cleanupChildren);
  process.on("exit", cleanupChildren);

  if (
    state.authMode === "emulate" &&
    state.googleEmulatorPort != null &&
    state.microsoftEmulatorPort != null
  ) {
    writeGeneratedEmulateConfig(state.baseUrl);

    registerChild(
      spawn(
        "pnpm",
        [
          "--dir",
          APP_DIR,
          "exec",
          "emulate",
          "--service",
          "google",
          "--seed",
          GENERATED_EMULATE_CONFIG_PATH,
          "--port",
          String(state.googleEmulatorPort),
        ],
        { cwd: ROOT_DIR, env: process.env, stdio: "inherit" },
      ),
    );

    registerChild(
      spawn(
        "pnpm",
        [
          "--dir",
          APP_DIR,
          "exec",
          "emulate",
          "--service",
          "microsoft",
          "--seed",
          GENERATED_EMULATE_CONFIG_PATH,
          "--port",
          String(state.microsoftEmulatorPort),
        ],
        { cwd: ROOT_DIR, env: process.env, stdio: "inherit" },
      ),
    );

    await waitForPort(state.googleEmulatorPort);
    await waitForPort(state.microsoftEmulatorPort);
  }

  const runtimeEnv = buildRuntimeEnv(state);
  const appCommand =
    state.urlMode === "portless"
      ? {
          args: [
            "run",
            "--name",
            state.portlessName || slugify(state.repoName),
            "--app-port",
            String(state.port),
            "pnpm",
            "--dir",
            APP_DIR,
            "dev",
          ],
          command: "portless",
        }
      : {
          args: ["--dir", APP_DIR, "dev"],
          command: "pnpm",
        };

  await new Promise<void>((resolvePromise, reject) => {
    const app = registerChild(
      spawn(appCommand.command, appCommand.args, {
        cwd: ROOT_DIR,
        env: runtimeEnv,
        stdio: "inherit",
      }),
    );

    app.once("error", (error) => {
      cleanupChildren();
      reject(
        new CommandExecutionError(
          error.message || `Failed to start ${appCommand.command}`,
          { exitCode: 1 },
        ),
      );
    });

    app.on("exit", (code, signal) => {
      cleanupChildren();

      if (signal) {
        reject(
          new CommandExecutionError(
            `Dev process exited from signal ${signal}`,
            { signal },
          ),
        );
        return;
      }

      if (code && code !== 0) {
        reject(
          new CommandExecutionError(`Dev process exited with code ${code}`, {
            exitCode: code,
          }),
        );
        return;
      }

      resolvePromise();
    });
  });
}

async function cleanWorktree() {
  const state = readState();
  const branch = state?.branch ?? (await getCurrentBranch());
  const dbName = state?.dbName ?? buildDatabaseName(branch);

  ensureSharedEnvLinks();

  const localEnv = readEnvFile(SHARED_ENV_LOCAL_PATH);
  await ensureLocalDependencies(localEnv);
  const sourceDatabaseUrl = resolveTemplateDatabaseUrl(localEnv, {
    purpose: "clean the branch database",
  });

  assertSafeLocalDatabaseUrl(sourceDatabaseUrl);
  assertSafeWorktreeDatabaseName(dbName);

  const adminUrl = toCliDatabaseUrl(sourceDatabaseUrl, "postgres");
  await dropDatabase(adminUrl, dbName);

  rmSync(GENERATED_EMULATE_CONFIG_PATH, { force: true });
  rmSync(STATE_PATH, { force: true });

  log(`Removed branch database ${dbName}`);
}

function buildRuntimeEnv(state: WorktreeState) {
  const baseEnv = { ...process.env };
  if (!existsSync(SHARED_ENV_LOCAL_PATH)) {
    throw new Error(
      `Missing shared env file: ${SHARED_ENV_LOCAL_PATH}. Run \`pnpm dev-setup init\` first or remove \`--skip-init\`.`,
    );
  }

  const localEnv = readEnvFile(SHARED_ENV_LOCAL_PATH);
  const overrides: Record<string, string> = {
    NEXT_PUBLIC_BASE_URL: state.baseUrl,
    PORT: String(state.port),
  };

  for (const key of [
    "DATABASE_URL",
    "DATABASE_URL_UNPOOLED",
    "DIRECT_URL",
    "PREVIEW_DATABASE_URL",
    "PREVIEW_DATABASE_URL_UNPOOLED",
  ]) {
    const value = localEnv[key];
    if (value) overrides[key] = replaceDatabaseName(value, state.dbName);
  }

  if (state.authMode === "emulate") {
    if (state.googleBaseUrl) overrides.GOOGLE_BASE_URL = state.googleBaseUrl;
    if (state.microsoftBaseUrl) {
      overrides.MICROSOFT_BASE_URL = state.microsoftBaseUrl;
    }

    overrides.GOOGLE_CLIENT_ID = EMULATED_GOOGLE_CLIENT_ID;
    overrides.GOOGLE_CLIENT_SECRET = EMULATED_GOOGLE_CLIENT_SECRET;
    overrides.MICROSOFT_CLIENT_ID = EMULATED_MICROSOFT_CLIENT_ID;
    overrides.MICROSOFT_CLIENT_SECRET = EMULATED_MICROSOFT_CLIENT_SECRET;
    if (state.googleEmulatorPort != null) {
      overrides.GOOGLE_EMULATOR_PORT = String(state.googleEmulatorPort);
    }
    if (state.microsoftEmulatorPort != null) {
      overrides.MICROSOFT_EMULATOR_PORT = String(state.microsoftEmulatorPort);
    }
  }

  overrides.REDIS_URL = `redis://${LOCAL_REDIS_HOST}:${LOCAL_REDIS_PORT}`;
  overrides.UPSTASH_REDIS_URL = `http://${LOCAL_REDIS_HOST}:${LOCAL_REDIS_HTTP_PORT}`;
  overrides.UPSTASH_REDIS_TOKEN = LOCAL_REDIS_TOKEN;

  return {
    ...baseEnv,
    ...overrides,
  };
}

function ensureSharedEnvLinks() {
  mkdirSync(APP_DIR, { recursive: true });

  for (const { required, source, target } of APP_ENV_LINKS) {
    if (!existsSync(source)) {
      if (required) {
        throw new Error(`Missing shared env file: ${source}`);
      }
      continue;
    }

    if (existsSync(target)) {
      try {
        const currentTarget = readFileSync(target, "utf8");
        const sourceContents = readFileSync(source, "utf8");
        if (currentTarget === sourceContents) continue;
      } catch {
        if (isMatchingSymlink(target, source)) continue;
      }

      if (!isMatchingSymlink(target, source)) {
        log(`Leaving existing env file in place: ${target}`);
        continue;
      }
    }

    rmSync(target, { force: true });
    symlinkSync(source, target);
  }
}

function writeGeneratedEmulateConfig(baseUrl: string) {
  const template = readFileSync(EMULATE_TEMPLATE_PATH, "utf8");
  const rendered = template.replaceAll("http://localhost:3000", baseUrl);
  writeFileSync(GENERATED_EMULATE_CONFIG_PATH, rendered);
}

function writeState(state: WorktreeState) {
  writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);
}

function readState() {
  if (!existsSync(STATE_PATH)) return null;

  try {
    const parsed = JSON.parse(readFileSync(STATE_PATH, "utf8")) as WorktreeState;
    return parsed.version === 1 ? parsed : null;
  } catch {
    return null;
  }
}

function readEnvFile(path: string) {
  const env: Record<string, string> = {};
  const contents = readFileSync(path, "utf8");

  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();
    env[key] = stripQuotes(rawValue);
  }

  return env;
}

async function resolvePort(
  urlMode: UrlMode,
  explicitPort: number | undefined,
  storedPort: number | undefined,
) {
  if (explicitPort != null) return explicitPort;
  if (urlMode === "conductor" && process.env.CONDUCTOR_PORT) {
    const conductorPort = Number.parseInt(process.env.CONDUCTOR_PORT, 10);
    if (!Number.isInteger(conductorPort) || conductorPort <= 0) {
      throw new Error(`Invalid CONDUCTOR_PORT: ${process.env.CONDUCTOR_PORT}`);
    }
    return conductorPort;
  }
  if (storedPort != null) return storedPort;

  for (let port = 3000; port <= 3900; port += 10) {
    if (await isPortFree(port)) return port;
  }

  throw new Error("Unable to find a free local development port.");
}

function resolveUrlMode(
  explicitMode: UrlMode | undefined,
  storedMode: UrlMode | undefined,
) {
  if (explicitMode) return explicitMode;
  if (storedMode) return storedMode;
  return process.env.CONDUCTOR_PORT ? "conductor" : "localhost";
}

function resolveAuthMode(
  explicitMode: AuthMode | undefined,
  storedMode: AuthMode | undefined,
) {
  return explicitMode ?? storedMode ?? "emulate";
}

function buildBaseUrl({
  branch,
  port,
  portlessName,
  urlMode,
}: {
  branch: string;
  port: number;
  portlessName: string;
  urlMode: UrlMode;
}) {
  if (urlMode !== "portless") return `http://localhost:${port}`;

  const repoLabel = slugify(portlessName);
  const branchLabel = slugify(branch);
  const host = isLinkedWorktree()
    ? `${branchLabel}.${repoLabel}.localhost`
    : `${repoLabel}.localhost`;

  if (process.env.PORTLESS_HTTPS === "1") {
    return `https://${host}`;
  }

  return `http://${host}:1355`;
}

function buildDatabaseName(branch: string) {
  const slug = slugify(branch).slice(0, 40);
  const hash = createHash("sha1").update(ROOT_DIR).digest("hex").slice(0, 8);
  return `${WORKTREE_DATABASE_PREFIX}${slug}_${hash}`.slice(0, 63);
}

function replaceDatabaseName(databaseUrl: string, databaseName: string) {
  const url = new URL(databaseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function getDatabaseName(databaseUrl: string) {
  return new URL(databaseUrl).pathname.replace(/^\/+/, "");
}

function toCliDatabaseUrl(databaseUrl: string, databaseName?: string) {
  const url = new URL(databaseUrl);
  if (databaseName) {
    url.pathname = `/${databaseName}`;
  }
  url.searchParams.delete("schema");
  return url.toString();
}

async function needsLocalRedisService(redisUrl: string) {
  const parsedUrl = new URL(redisUrl);
  if (!LOCAL_DATABASE_HOSTS.has(parsedUrl.hostname)) return false;

  const defaultPort = parsedUrl.protocol.startsWith("http") ? "8079" : "6380";
  const port = Number.parseInt(parsedUrl.port || defaultPort, 10);
  return !(await canConnectToPort(port, parsedUrl.hostname));
}

async function getCurrentBranch() {
  const output = await captureCommand("git", ["branch", "--show-current"]);
  const branch = output.trim();
  if (!branch) throw new Error("Could not determine the current git branch.");
  return branch;
}

async function checkDatabaseExists(adminUrl: string, databaseName: string) {
  const output = await captureCommand("psql", [
    adminUrl,
    "-Atqc",
    `SELECT 1 FROM pg_database WHERE datname = '${databaseName}'`,
  ]);

  return output.trim() === "1";
}

async function createDatabase(adminUrl: string, databaseName: string) {
  assertSafeLocalDatabaseUrl(adminUrl);
  assertSafeWorktreeDatabaseName(databaseName);
  log(`Creating database ${databaseName}`);
  await runCommand("psql", [
    adminUrl,
    "-c",
    `CREATE DATABASE "${databaseName}"`,
  ]);
}

async function dropDatabase(adminUrl: string, databaseName: string) {
  assertSafeLocalDatabaseUrl(adminUrl);
  assertSafeWorktreeDatabaseName(databaseName);
  await runCommand("psql", [
    adminUrl,
    "-c",
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${databaseName}' AND pid <> pg_backend_pid()`,
  ]);
  await runCommand("psql", [
    adminUrl,
    "-c",
    `DROP DATABASE IF EXISTS "${databaseName}"`,
  ]);
}

async function waitForPort(port: number, host = "localhost") {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await canConnectToPort(port, host)) return;
    await delay(500);
  }

  throw new Error(
    `Timed out waiting for ${host}:${port} to accept connections.`,
  );
}

async function ensureLocalDependencies(localEnv: Record<string, string>) {
  await ensureLocalPostgres(localEnv);
  await ensureLocalRedis();
}

async function ensureLocalPostgres(localEnv: Record<string, string>) {
  const databaseUrl = resolveTemplateDatabaseUrl(localEnv, { required: false });
  if (!databaseUrl) return;

  const parsedUrl = new URL(databaseUrl);
  if (!LOCAL_DATABASE_HOSTS.has(parsedUrl.hostname)) return;

  const port = Number.parseInt(parsedUrl.port || "5432", 10);
  if (await canConnectToPort(port, parsedUrl.hostname)) return;

  log(`Starting local Postgres on port ${port} with docker compose`);

  await runCommand(
    "docker",
    ["compose", "up", "-d", "db"],
    {
      cwd: ROOT_DIR,
      env: {
        ...process.env,
        POSTGRES_BIND_HOST: parsedUrl.hostname === "::1" ? "::1" : "127.0.0.1",
        POSTGRES_DB: getDatabaseName(databaseUrl),
        POSTGRES_PASSWORD: decodeURIComponent(parsedUrl.password),
        POSTGRES_PORT: String(port),
        POSTGRES_USER: decodeURIComponent(parsedUrl.username),
      },
    },
  );

  await waitForPort(port, parsedUrl.hostname);
  await waitForPostgres(databaseUrl);
}

async function ensureLocalRedis() {
  const redisUrl = `redis://${LOCAL_REDIS_HOST}:${LOCAL_REDIS_PORT}`;
  const upstashUrl = `http://${LOCAL_REDIS_HOST}:${LOCAL_REDIS_HTTP_PORT}`;

  const needsTcpRedis = await needsLocalRedisService(redisUrl);
  const needsHttpRedis = await needsLocalRedisService(upstashUrl);

  if (!needsTcpRedis && !needsHttpRedis) return;

  log("Starting local Redis services with docker compose");

  const env = { ...process.env };
  env.REDIS_BIND_HOST = LOCAL_REDIS_HOST;
  env.REDIS_PORT = String(LOCAL_REDIS_PORT);
  env.REDIS_HTTP_BIND_HOST = LOCAL_REDIS_HOST;
  env.REDIS_HTTP_PORT = String(LOCAL_REDIS_HTTP_PORT);
  env.UPSTASH_REDIS_TOKEN = LOCAL_REDIS_TOKEN;

  await runCommand(
    "docker",
    ["compose", "up", "-d", "redis", "serverless-redis-http"],
    {
      cwd: ROOT_DIR,
      env,
    },
  );

  await waitForPort(LOCAL_REDIS_PORT, LOCAL_REDIS_HOST);
  await waitForPort(LOCAL_REDIS_HTTP_PORT, LOCAL_REDIS_HOST);
}

async function isPortFree(port: number) {
  await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 10));

  const results = await Promise.all(
    ["127.0.0.1", "::1"].map((host) => checkPortBinding(port, host)),
  );

  return results.every((result) => result !== "in-use");
}

async function canConnectToPort(port: number, host = "localhost") {
  const hosts = host === "localhost" ? ["127.0.0.1", "::1"] : [host];

  for (const candidateHost of hosts) {
    if (await canConnectToHost(port, candidateHost)) {
      return true;
    }
  }

  return false;
}

async function waitForPostgres(databaseUrl: string) {
  const adminUrl = toCliDatabaseUrl(databaseUrl, "postgres");

  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await captureCommand("psql", [adminUrl, "-Atqc", "SELECT 1"]);
      return;
    } catch {
      await delay(1000);
    }
  }

  throw new Error(
    `Timed out waiting for Postgres to become ready at ${new URL(databaseUrl).host}.`,
  );
}

async function runShellCommand(command: string) {
  await runCommand(process.env.SHELL || "zsh", ["-lc", command]);
}

async function runCommand(
  command: string,
  args: string[],
  options?: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
  },
) {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options?.cwd ?? ROOT_DIR,
      env: options?.env ?? process.env,
      stdio: "inherit",
    });

    child.once("error", (error) => {
      reject(
        new CommandExecutionError(
          error.message || `Failed to start ${command}`,
          { exitCode: 1 },
        ),
      );
    });

    child.on("exit", (code, signal) => {
      if (signal) {
        reject(
          new CommandExecutionError(`${command} exited with signal ${signal}`, {
            signal,
          }),
        );
        return;
      }

      if (code && code !== 0) {
        reject(
          new CommandExecutionError(`${command} exited with code ${code}`, {
            exitCode: code,
          }),
        );
        return;
      }

      resolvePromise();
    });
  });
}

async function captureCommand(command: string, args: string[]) {
  return await new Promise<string>((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT_DIR,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.once("error", (error) => {
      reject(
        new CommandExecutionError(
          error.message || `Failed to start ${command}`,
          { exitCode: 1 },
        ),
      );
    });

    child.on("exit", (code, signal) => {
      if (signal) {
        reject(
          new CommandExecutionError(`${command} exited with signal ${signal}`, {
            signal,
          }),
        );
        return;
      }

      if (code && code !== 0) {
        reject(
          new CommandExecutionError(
            stderr.trim() || `${command} exited with code ${code}`,
            { exitCode: code },
          ),
        );
        return;
      }

      resolvePromise(stdout);
    });
  });
}

function printStateSummary(prefix: string, state: WorktreeState) {
  console.log(
    [
      `${prefix}:`,
      `branch=${state.branch}`,
      `db=${state.dbName}`,
      `url=${state.baseUrl}`,
      `auth=${state.authMode}`,
    ].join(" "),
  );
}

function printHelp() {
  console.log(`Usage: pnpm dev-setup <command> [options]

Commands:
  init                 Prepare env symlinks, the branch database, and emulator seed config
  dev                  Start the app, and emulator processes when auth=emulate
  exec -- <command>    Run a command with the branch dev env injected
  clean                Drop the branch database and remove cached state

Options:
  --db <clone-main|empty>
  --auth <emulate|real>
  --url <conductor|localhost|portless>
  --port <number>
  --portless-name <label>
  --reset-db
  --skip-init
`);
}

function assertOptionValue(
  flag: string,
  value: string | undefined,
): asserts value is string {
  if (!value) throw new Error(`Missing value for ${flag}`);
}

function assertSafeLocalDatabaseUrl(databaseUrl: string) {
  const hostname = new URL(databaseUrl).hostname;
  if (!LOCAL_DATABASE_HOSTS.has(hostname)) {
    throw new Error(
      `Refusing to manage a non-local database host: ${hostname}. Update ${SHARED_ENV_LOCAL_PATH} to use localhost for branch development.`,
    );
  }
}

function assertSafeWorktreeDatabaseName(databaseName: string) {
  if (!databaseName.startsWith(WORKTREE_DATABASE_PREFIX)) {
    throw new Error(
      `Refusing to manage a database without the ${WORKTREE_DATABASE_PREFIX} prefix: ${databaseName}`,
    );
  }
}

function isMatchingSymlink(target: string, source: string) {
  try {
    return (
      lstatSync(target).isSymbolicLink() && readlinkSync(target) === source
    );
  } catch {
    return false;
  }
}

function isLinkedWorktree() {
  try {
    return lstatSync(resolve(ROOT_DIR, ".git")).isFile();
  } catch {
    return false;
  }
}

function stripQuotes(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "branch";
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function log(message: string) {
  console.log(`[dev-setup] ${message}`);
}

function delay(ms: number) {
  return new Promise<void>((resolvePromise) => setTimeout(resolvePromise, ms));
}

function resolveTemplateDatabaseUrl(
  localEnv: Record<string, string>,
  options?: { purpose?: string; required?: boolean },
) {
  const databaseUrl =
    localEnv.PREVIEW_DATABASE_URL ||
    localEnv.DATABASE_URL ||
    localEnv.DIRECT_URL ||
    localEnv.DATABASE_URL_UNPOOLED ||
    localEnv.PREVIEW_DATABASE_URL_UNPOOLED;

  if (databaseUrl || options?.required === false) {
    return databaseUrl;
  }

  const purpose = options?.purpose ?? "use as a local database template";
  throw new Error(
    `Missing DATABASE_URL in ${SHARED_ENV_LOCAL_PATH}. Cannot ${purpose}.`,
  );
}

function getErrorExitCode(error: unknown) {
  if (error instanceof CommandExecutionError && error.exitCode != null) {
    return error.exitCode;
  }

  return 1;
}

async function canConnectToHost(port: number, host: string) {
  return await new Promise<boolean>((resolvePromise) => {
    const socket = net.connect({ host, port });

    socket.once("connect", () => {
      socket.end();
      resolvePromise(true);
    });

    socket.once("error", () => {
      socket.destroy();
      resolvePromise(false);
    });
  });
}

async function checkPortBinding(port: number, host: string) {
  return await new Promise<"free" | "in-use" | "unsupported">(
    (resolvePromise) => {
      const server = net.createServer();
      server.unref();

      server.once("error", (error: NodeJS.ErrnoException) => {
        if (
          error.code === "EAFNOSUPPORT" ||
          error.code === "EADDRNOTAVAIL"
        ) {
          resolvePromise("unsupported");
          return;
        }

        resolvePromise("in-use");
      });

      server.listen(port, host, () => {
        server.close(() => resolvePromise("free"));
      });
    },
  );
}

function isCommand(value: string): value is Command {
  return (
    value === "init" ||
    value === "dev" ||
    value === "exec" ||
    value === "clean"
  );
}

function isAuthMode(value: string): value is AuthMode {
  return value === "emulate" || value === "real";
}

function isDbMode(value: string): value is DbMode {
  return value === "clone-main" || value === "empty";
}

function isUrlMode(value: string): value is UrlMode {
  return value === "conductor" || value === "localhost" || value === "portless";
}

function parseCli(args: string[]): CliConfig {
  const [rawCommand, ...rest] = args;
  if (!rawCommand || rawCommand === "--help" || rawCommand === "-h") {
    printHelp();
    process.exit(0);
  }

  if (!isCommand(rawCommand)) {
    throw new Error(`Unknown command: ${rawCommand}`);
  }

  const options: CliOptions = {};
  const commandArgs: string[] = [];

  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (argument === "--") {
      commandArgs.push(...rest.slice(index + 1));
      break;
    }

    if (argument === "--reset-db") {
      options.forceReset = true;
      continue;
    }

    if (argument === "--skip-init") {
      options.skipInit = true;
      continue;
    }

    const [flag, inlineValue] = argument.split("=", 2);
    const nextValue = inlineValue ?? rest[index + 1];
    const consumesNext = inlineValue == null;

    switch (flag) {
      case "--auth":
        assertOptionValue(flag, nextValue);
        if (!isAuthMode(nextValue)) {
          throw new Error(`Invalid auth mode: ${nextValue}`);
        }
        options.authMode = nextValue;
        if (consumesNext) index += 1;
        break;
      case "--db":
        assertOptionValue(flag, nextValue);
        if (!isDbMode(nextValue)) {
          throw new Error(`Invalid db mode: ${nextValue}`);
        }
        options.dbMode = nextValue;
        if (consumesNext) index += 1;
        break;
      case "--url":
        assertOptionValue(flag, nextValue);
        if (!isUrlMode(nextValue)) {
          throw new Error(`Invalid url mode: ${nextValue}`);
        }
        options.urlMode = nextValue;
        if (consumesNext) index += 1;
        break;
      case "--port":
        assertOptionValue(flag, nextValue);
        options.explicitPort = Number.parseInt(nextValue, 10);
        if (!Number.isInteger(options.explicitPort) || options.explicitPort <= 0) {
          throw new Error(`Invalid port: ${nextValue}`);
        }
        if (consumesNext) index += 1;
        break;
      case "--portless-name":
        assertOptionValue(flag, nextValue);
        options.portlessName = nextValue;
        if (consumesNext) index += 1;
        break;
      default:
        throw new Error(`Unknown option: ${argument}`);
    }
  }

  return { command: rawCommand, commandArgs, options };
}

async function ensureWorktreeReady(options: CliOptions) {
  mkdirSync(CONTEXT_DIR, { recursive: true });
  ensureSharedEnvLinks();
  const state = await resolveWorktreeState(options);
  const localEnv = readEnvFile(SHARED_ENV_LOCAL_PATH);

  await ensureLocalDependencies(localEnv);
  await ensureWorktreeDatabase(state, localEnv, options.forceReset === true);
  writeState(state);

  if (state.authMode === "emulate") {
    writeGeneratedEmulateConfig(state.baseUrl);
  }

  return state;
}

async function resolveWorktreeState(options: CliOptions): Promise<WorktreeState> {
  const existingState = readState();
  const branch = await getCurrentBranch();
  const repoName = basename(ROOT_DIR);
  const urlMode = resolveUrlMode(options.urlMode, existingState?.urlMode);
  const authMode = resolveAuthMode(options.authMode, existingState?.authMode);
  const port = await resolvePort(urlMode, options.explicitPort, existingState?.port);

  if (
    authMode === "real" &&
    (urlMode !== "localhost" || port !== 3000)
  ) {
    throw new Error(
      "Real OAuth mode is only supported on http://localhost:3000 in this first pass.",
    );
  }

  const dbMode = options.dbMode ?? existingState?.dbMode ?? "clone-main";
  const dbName = buildDatabaseName(branch);
  const portlessName =
    options.portlessName ?? existingState?.portlessName ?? slugify(repoName);
  const baseUrl = buildBaseUrl({
    branch,
    port,
    portlessName,
    urlMode,
  });
  const googleEmulatorPort = authMode === "emulate" ? port + 2 : undefined;
  const microsoftEmulatorPort = authMode === "emulate" ? port + 3 : undefined;

  return {
    authMode,
    baseUrl,
    branch,
    dbMode,
    dbName,
    googleBaseUrl:
      googleEmulatorPort != null
        ? `http://localhost:${googleEmulatorPort}`
        : undefined,
    googleEmulatorPort,
    microsoftBaseUrl:
      microsoftEmulatorPort != null
        ? `http://localhost:${microsoftEmulatorPort}`
        : undefined,
    microsoftEmulatorPort,
    port,
    portlessName,
    repoName,
    urlMode,
    version: 1,
  };
}
