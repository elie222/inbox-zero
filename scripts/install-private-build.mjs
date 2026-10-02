import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function installPrivateBuild() {
  const env = process.env;
  const root = path.resolve(import.meta.dirname, "..");
  if (env.IS_OAUTH_PROXY_SERVER === "true") {
    console.log("Private build integration is not needed on the OAuth proxy; skipping.");
    return;
  }
  const repository = env.PRIVATE_BUILD_REPOSITORY;
  const token = env.PRIVATE_BUILD_TOKEN;
  const ref = env.PRIVATE_BUILD_REF || "main";
  if (!repository && !token && !env.PRIVATE_BUILD_REF) {
    console.log("Private build integration is not configured; skipping.");
    return;
  }
  if (!repository || !token) {
    throw new Error("Private build integration requires a repository and read-only token.");
  }
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(repository) || /\s/.test(token)) {
    throw new Error("Invalid private build configuration.");
  }
  if (ref.startsWith("-") || /\s/.test(ref)) {
    throw new Error("Invalid private build reference.");
  }
  if (!/^[a-fA-F0-9]{40}$/.test(ref)) {
    run("git", ["check-ref-format", "--branch", ref], { cwd: root, env }, "reference validation");
  }

  const temporary = await mkdtemp(path.join(os.tmpdir(), "private-build-"));
  try {
    const askpass = path.join(temporary, "askpass.mjs");
    await writeFile(askpass, `#!/usr/bin/env node\nprocess.stdout.write(/username/i.test(process.argv[2] || "") ? "x-access-token\\n" : process.env.PRIVATE_BUILD_TOKEN + "\\n");\n`, { mode: 0o700 });
    const gitEnv = {
      ...env,
      GIT_ASKPASS: askpass,
      GIT_TERMINAL_PROMPT: "0",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/dev/null",
    };
    run("git", ["init", "--quiet", temporary], { cwd: root, env: gitEnv }, "checkout preparation");
    run("git", [
      "-c", "credential.helper=", "fetch", "--quiet", "--depth=1",
      `https://github.com/${repository}.git`, /^[a-fA-F0-9]{40}$/.test(ref) ? ref : `refs/heads/${ref}`,
    ], { cwd: temporary, env: gitEnv }, "source download");
    const commit = run("git", ["rev-parse", "--verify", "FETCH_HEAD"], { cwd: temporary, env: gitEnv }, "revision verification").trim();
    if (!/^[a-fA-F0-9]{40}$/.test(commit) || (/^[a-fA-F0-9]{40}$/.test(ref) && commit.toLowerCase() !== ref.toLowerCase())) {
      throw new Error("Private build revision verification failed.");
    }
    run("git", ["checkout", "--quiet", "--detach", commit], { cwd: temporary, env: gitEnv }, "source checkout");
    const childEnv = { ...env, PRIVATE_BUILD_COMMIT: commit };
    childEnv.PRIVATE_BUILD_TOKEN = undefined;
    const output = run(process.execPath, ["scripts/install-overlay.mjs", root], { cwd: temporary, env: childEnv }, "overlay installation");
    if (output.trim()) console.log(output.replaceAll(token, "[redacted]").trim());
    console.log("Private build integration installed.");
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

function run(command, args, options, step) {
  try {
    const result = spawnSync(command, args, {
      ...options,
      encoding: "utf8",
      timeout: command === process.execPath ? 10 * 60_000 : 120_000,
      maxBuffer: command === process.execPath ? 16 * 1024 * 1024 : 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (result.error || result.status !== 0) throw new Error("Child process failed");
    return result.stdout || "";
  } catch {
    // Downloaded scripts and Git errors can include credentials or private URLs.
    throw new Error(`Private build ${step} failed.`);
  }
}

installPrivateBuild().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
