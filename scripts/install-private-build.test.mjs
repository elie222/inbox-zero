import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { test } from "node:test";
import { installPrivateBuild, runCommand } from "./install-private-build.mjs";

const commit = "0123456789abcdef0123456789abcdef01234567";
const credential = "synthetic-read-only-secret";
const configuration = {
  PRIVATE_BUILD_REPOSITORY: "example/build-extension",
  PRIVATE_BUILD_TOKEN: credential,
};

function fixture(overrides = {}) {
  const calls = [];
  const logs = [];
  const run = (command, args, options) => {
    calls.push({ command, args, options });
    if (args[0] === "check-ref-format") return spawnSync(command, args, { encoding: "utf8" });
    if (args[0] === "rev-parse") return { status: 0, stdout: `${commit}\n` };
    return { status: 0, stdout: "" };
  };
  return { calls, logs, run, env: { ...configuration, ...overrides } };
}

async function executeFixture(state) {
  await installPrivateBuild({ env: state.env, run: state.run, log: (message) => state.logs.push(message) });
}

test("unconfigured integrations skip without fetching", async () => {
  const state = fixture();
  state.env = {};
  await executeFixture(state);
  assert.equal(state.calls.length, 0);
  assert.match(state.logs[0], /skipping/);
});

test("OAuth proxy skips even incomplete integration configuration", async () => {
  const logs = [];
  await installPrivateBuild({
    env: { IS_OAUTH_PROXY_SERVER: "true", PRIVATE_BUILD_REPOSITORY: "example/private" },
    run: () => { throw new Error("Unexpected download"); },
    log: (message) => logs.push(message),
  });
  assert.match(logs[0], /OAuth proxy/);
});

test("partial configuration fails before downloading", async () => {
  for (const env of [{ PRIVATE_BUILD_REPOSITORY: configuration.PRIVATE_BUILD_REPOSITORY }, { PRIVATE_BUILD_TOKEN: credential }, { PRIVATE_BUILD_REF: "main" }]) {
    const state = fixture();
    state.env = env;
    await assert.rejects(executeFixture(state), /requires a repository and read-only token/);
    assert.equal(state.calls.length, 0);
  }
});

test("uses askpass rather than credentials in Git arguments, strips installer credential, and cleans up", async () => {
  const state = fixture();
  let askpass;
  const run = state.run;
  state.run = (command, args, options) => {
    if (args.includes("fetch")) {
      askpass = options.env.GIT_ASKPASS;
      assert.ok(!readFileSync(askpass, "utf8").includes(credential));
      assert.equal(statSync(askpass).mode & 0o777, 0o700);
      const answer = spawnSync(process.execPath, [askpass, "Password"], { env: options.env, encoding: "utf8" });
      assert.equal(answer.stdout, `${credential}\n`);
    }
    return run(command, args, options);
  };
  await executeFixture(state);
  const fetch = state.calls.find((call) => call.args.includes("fetch"));
  assert.equal(fetch.args.at(-1), "refs/heads/main");
  assert.equal(fetch.options.env.GIT_TERMINAL_PROMPT, "0");
  assert.ok(!JSON.stringify(state.calls.map((call) => call.args)).includes(credential));
  const installer = state.calls.find((call) => call.command === process.execPath);
  assert.equal(installer.args[0], "scripts/install-overlay.mjs");
  assert.equal(installer.options.env.PRIVATE_BUILD_COMMIT, commit);
  assert.equal(installer.options.cwd, fetch.options.cwd);
  assert.equal(installer.options.env.PRIVATE_BUILD_TOKEN, undefined);
  assert.equal(state.env.PRIVATE_BUILD_TOKEN, credential);
  await assert.rejects(access(askpass), { code: "ENOENT" });
  await assert.rejects(access(fetch.options.cwd), { code: "ENOENT" });
});

test("passes an explicit commit exactly and verifies the downloaded revision", async () => {
  const state = fixture({ PRIVATE_BUILD_REF: commit });
  await executeFixture(state);
  assert.equal(state.calls.find((call) => call.args.includes("fetch")).args.at(-1), commit);
  assert.equal(state.calls.find((call) => call.args[0] === "checkout").args.at(-1), commit);
  const mismatch = fixture({ PRIVATE_BUILD_REF: "f".repeat(40) });
  await assert.rejects(executeFixture(mismatch), /revision verification failed/);
  assert.ok(!mismatch.calls.some((call) => call.command === process.execPath));
});

test("rejects invalid refs and repository paths before downloading", async () => {
  for (const ref of ["--upload-pack=unsafe", "feature..branch", "invalid ref", "bad\nref"]) {
    const state = fixture({ PRIVATE_BUILD_REF: ref });
    await assert.rejects(executeFixture(state), /reference/);
    assert.ok(!state.calls.some((call) => call.args.includes("fetch")));
  }
  await assert.rejects(executeFixture(fixture({ PRIVATE_BUILD_REPOSITORY: "https://other.example/repo" })), /configuration/);
});

test("sanitizes failure output and removes checkout after a failed child", async () => {
  const state = fixture();
  const run = state.run;
  state.run = (command, args, options) => {
    const result = run(command, args, options);
    if (args.includes("fetch")) return { status: 1, stdout: credential, stderr: credential };
    return result;
  };
  let failure;
  try { await executeFixture(state); } catch (error) { failure = error; }
  assert.match(failure.message, /source download failed/);
  assert.ok(!failure.message.includes(credential));
  assert.ok(!JSON.stringify(state.logs).includes(credential));
  const fetch = state.calls.find((call) => call.args.includes("fetch"));
  await assert.rejects(access(fetch.options.cwd), { code: "ENOENT" });
});

test("redacts credentials even if an installer prints a captured value", async () => {
  const state = fixture();
  const run = state.run;
  state.run = (command, args, options) => {
    const result = run(command, args, options);
    return command === process.execPath ? { status: 0, stdout: `installed ${credential}` } : result;
  };
  await executeFixture(state);
  assert.ok(!JSON.stringify(state.logs).includes(credential));
  assert.ok(state.logs.some((message) => message.includes("[redacted]")));
});

test("Vercel installs overlay before marketing and dependencies and clears the build token", async () => {
  const config = JSON.parse(await readFile(new URL("../apps/web/vercel.json", import.meta.url), "utf8"));
  assert.match(config.buildCommand, /^cd \.\.\/\.\. && unset PRIVATE_BUILD_TOKEN &&/);
  assert.match(config.installCommand, /node scripts\/install-private-build\.mjs && unset PRIVATE_BUILD_TOKEN && bash clone-marketing\.sh && corepack pnpm install/);
});

test("installer runner accepts output larger than the Git allowance", () => {
  const outputSize = 2 * 1024 * 1024;
  const result = runCommand(process.execPath, ["-e", "process.stdout.write('x'.repeat(2 * 1024 * 1024))"], {});
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.length, outputSize);
  const git = runCommand("git", ["--version"], {});
  assert.equal(git.status, 0);
  assert.match(git.stdout, /^git version/);
});
