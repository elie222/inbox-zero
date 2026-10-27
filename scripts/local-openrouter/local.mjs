import { spawn, execFileSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, appendFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { connect } from "node:net";
import { delimiter, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const root = resolve(import.meta.dirname, "../..");
const tools = resolve(root, "../tools");
const nodeDir = resolve(tools, "node-v24.22.1-win-x64");
const node = resolve(nodeDir, "node.exe");
const pnpm = resolve(tools, "pnpm/node_modules/pnpm/bin/pnpm.cjs");
const pg = resolve(tools, "postgresql16/pgsql/bin");
const data = resolve(root, ".context");
const statePath = resolve(data, "local-processes.json");
process.chdir(root);
process.loadEnvFile(resolve(root, "apps/web/.env.local"));
process.env.PATH = [nodeDir, resolve(tools, "pnpm"), "C:\\Program Files\\Git\\bin", process.env.PATH].join(delimiter);
process.env.NODE_ENV = "production";
process.env.NEXT_TELEMETRY_DISABLED = "1";
mkdirSync(resolve(data, "logs"), { recursive: true });

function run(command, args, options = {}) {
  return execFileSync(command, args, { cwd: root, windowsHide: true, timeout: 60_000, stdio: "inherit", ...options });
}

function ensureDatabase() {
  const status = spawn(pgPath("pg_ctl"), ["-D", resolve(data, "postgres"), "status"], { windowsHide: true, stdio: "ignore" });
  return new Promise((done, reject) => {
    status.on("error", reject);
    status.on("exit", (code) => {
      try {
        if (code !== 0) run(pgPath("pg_ctl"), ["-D", resolve(data, "postgres"), "-l", resolve(data, "logs/postgres.log"), "-o", "-h 127.0.0.1 -p 5433", "-w", "start"]);
        done();
      } catch (error) { reject(error); }
    });
  });
}

function pgPath(name) { return resolve(pg, `${name}.exe`); }

async function listening(port) {
  return new Promise((done) => {
    const socket = connect({ port, host: "127.0.0.1" });
    socket.setTimeout(500);
    socket.once("connect", () => { socket.destroy(); done(true); });
    socket.once("error", () => done(false));
    socket.once("timeout", () => { socket.destroy(); done(false); });
  });
}

function mailJobsRunning() {
  try {
    const status = JSON.parse(readFileSync(resolve(data, "mail-jobs-status.json"), "utf8"));
    if (Date.now() - Date.parse(status.updatedAt) > 120_000) return false;
    const pid = Number(status.pid);
    if (!Number.isSafeInteger(pid) || pid <= 0) return false;
    const started = new Date(status.startedAt).toISOString();
    const script = `$taskProcess=Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if (!$taskProcess) { exit 1 }; if ([Math]::Abs(($taskProcess.StartTime.ToUniversalTime()-[DateTime]::Parse('${started}').ToUniversalTime()).TotalSeconds) -ge 5) { exit 1 }; $taskDetails=Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}'; if ($taskDetails.CommandLine -notmatch 'mail-jobs[.]mjs') { exit 1 }; exit 0`;
    run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { stdio: "ignore", timeout: 10_000 });
    return true;
  } catch { return false; }
}

async function stop() {
  // Stop only processes whose PID and start timestamp match our saved instance.
  if (existsSync(statePath)) {
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    for (const child of [...state.children].reverse()) {
      const script = `$p=Get-Process -Id ${Number(child.pid)} -ErrorAction SilentlyContinue; if ($p -and [Math]::Abs(($p.StartTime.ToUniversalTime()-[DateTime]::Parse('${child.started}').ToUniversalTime()).TotalSeconds) -lt 5) { Stop-Process -Id $p.Id -Force }; exit 0`;
      run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { stdio: "ignore" });
    }
    unlinkSync(statePath);
  }
  const pgStatus = spawn(pgPath("pg_ctl"), ["-D", resolve(data, "postgres"), "status"], { windowsHide: true, stdio: "ignore" });
  const pgRunning = await new Promise((done) => { pgStatus.on("exit", (code) => done(code === 0)); pgStatus.on("error", () => done(false)); });
  if (pgRunning) run(pgPath("pg_ctl"), ["-D", resolve(data, "postgres"), "-m", "fast", "-w", "stop"], { stdio: "ignore" });
  console.log("Inbox Zero local services stopped.");
}

async function start() {
  if (!existsSync(resolve(root, "apps/web/.next/BUILD_ID"))) throw new Error("Build first with Build Inbox Zero.cmd");
  if (await listening(3000)) throw new Error("Port 3000 is already in use. Check whether Inbox Zero is already running.");
  if (!process.env.CRON_SECRET) {
    const secret = randomBytes(32).toString("hex");
    appendFileSync(resolve(root, "apps/web/.env.local"), `\nCRON_SECRET=${secret}\n`);
    process.env.CRON_SECRET = secret;
  }
  const children = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")).children : [];
  children.push({ name: "launcher", pid: process.pid, started: new Date().toISOString() });
  const record = () => writeFileSync(statePath, JSON.stringify({ children }, null, 2));
  function service(name, command, args, cwd = root) {
    const child = spawn(command, args, { cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.pipe(createWriteStream(resolve(data, `logs/${name}.log`), { flags: "a" }));
    child.stderr.pipe(createWriteStream(resolve(data, `logs/${name}.err.log`), { flags: "a" }));
    child.once("error", () => { console.error(`${name} failed to start; check .context/logs`); process.exitCode = 1; });
    children.push({ name, pid: child.pid, started: new Date().toISOString() });
    record();
    child.unref();
    return child;
  }
  await ensureDatabase();
  if (!(await listening(6380))) service("redis", resolve(tools, "garnet/net10.0/GarnetServer.exe"), ["--bind", "127.0.0.1", "--port", "6380", "--lua", "--memory", "256m", "--index", "16m"], data);
  if (!(await listening(3010))) service("openrouter", node, ["scripts/local-openrouter/gateway.mjs"]);
  if (!(await listening(8079))) service("redis-http", node, ["--import", "tsx", "apps/web/scripts/local-redis-http.ts"]);
  for (const port of [6380, 3010, 8079]) {
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (await listening(port)) { ready = true; break; }
      await delay(500);
    }
    if (!ready) throw new Error(`Service on port ${port} failed; check .context/logs`);
  }
  service("web", node, ["--import", "tsx", resolve(root, "apps/web/node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", "3000"], resolve(root, "apps/web"));
  let webReady = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch("http://127.0.0.1:3000/login", { signal: AbortSignal.timeout(2000) });
      await response.body?.cancel();
      if (response.status === 200) { webReady = true; break; }
    } catch {}
    await delay(500);
  }
  if (!webReady) throw new Error("Web server failed to start; check .context/logs/web.err.log");
  if (process.env.OPENROUTER_API_KEY) service("ai-worker", node, ["scripts/local-openrouter/ai-worker.mjs"]);
  if (!mailJobsRunning()) service("mail-jobs", node, ["scripts/local-openrouter/mail-jobs.mjs"]);
  console.log("Inbox Zero ready at http://localhost:3000/login");
  console.log("Stop with Stop Inbox Zero.cmd. Logs are in .context/logs.");
}

try {
  const command = process.argv[2];
  if (command === "build") {
    await ensureDatabase();
    run(node, [pnpm, "build"], { timeout: 1_800_000 });
  } else if (command === "stop") {
    await stop();
  } else if (command === "start") {
    await start();
  } else {
    throw new Error("Usage: local.mjs build|start|stop");
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
