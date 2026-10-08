import assert from "node:assert/strict";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import { test } from "vitest";
import {
  StartupOwnership,
  stopStartup,
  readStartupState,
} from "./startup-ownership.mjs";

test("a stopped startup cannot republish state or take a replacement owner's claim", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "emulator-ownership-"));
  const statePath = path.join(directory, "state.json");
  const firstState = {
    ownerToken: "first",
    runDir: path.join(directory, "first"),
    pids: [],
  };
  mkdirSync(firstState.runDir);
  const first = new StartupOwnership(statePath, firstState);
  let replacement;
  try {
    firstState.pids.push(123);
    first.publish();
    assert.deepEqual(JSON.parse(readFileSync(statePath, "utf8")).pids, [123]);
    let created = false;
    assert.throws(
      () =>
        first.start(() => {
          created = true;
          stopStartup(firstState);
          return 456;
        }),
      /ownership ended/,
    );
    assert.equal(created, true);
    assert.deepEqual(firstState.pids, [123, 456]);
    assert.throws(
      () =>
        first.start(() => {
          throw new Error("must not spawn after stop");
        }),
      /ownership ended/,
    );
    assert.throws(() => first.assertCurrent(), /ownership ended/);
    assert.throws(() => first.publish(), /ownership ended/);
    rmSync(statePath);
    assert.throws(() => first.publish(), /ownership ended/);
    const secondState = {
      ownerToken: "second",
      runDir: path.join(directory, "second"),
      pids: [],
    };
    mkdirSync(secondState.runDir);
    replacement = new StartupOwnership(statePath, secondState);
    assert.throws(() => first.publish(), /ownership ended/);
    assert.equal(
      JSON.parse(readFileSync(statePath, "utf8")).ownerToken,
      "second",
    );
    replacement.publish();
  } finally {
    first.close();
    replacement?.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test.each([
  [[]],
  [["--integration-tests"]],
])("down rejects an owner-token without a value before cleanup %j", (trailing) => {
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL("./stack.mjs", import.meta.url)),
      "down",
      "--owner-token",
      ...trailing,
    ],
    { encoding: "utf8", timeout: 5000 },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--owner-token requires a value/);
});

test("state reads tolerate an interrupted publication briefly but reject a permanently corrupt claim", async () => {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), "emulator-publication-"),
  );
  const statePath = path.join(directory, "state.json");
  try {
    writeFileSync(statePath, "{");
    const reading = readStartupState(statePath);
    writeFileSync(
      statePath,
      JSON.stringify({ ownerToken: "owned", pids: [123] }),
    );
    assert.deepEqual(await reading, { ownerToken: "owned", pids: [123] });
    writeFileSync(statePath, "broken");
    await assert.rejects(readStartupState(statePath), SyntaxError);
    rmSync(statePath);
    assert.equal(await readStartupState(statePath), undefined);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("stop tolerates a removed run directory and still leaves the claim removable", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "emulator-stale-"));
  const statePath = path.join(directory, "state.json");
  const state = {
    ownerToken: "stale",
    runDir: path.join(directory, "removed"),
    pids: [],
  };
  mkdirSync(state.runDir);
  const ownership = new StartupOwnership(statePath, state);
  try {
    rmSync(state.runDir, { recursive: true });
    assert.doesNotThrow(() => stopStartup(state));
    assert.throws(() => ownership.assertCurrent(), /ownership ended/);
    rmSync(statePath);
    assert.equal(await readStartupState(statePath), undefined);
  } finally {
    ownership.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("down still terminates owned children and removes stale state when runDir is gone", async () => {
  const project = mkdtempSync(path.join(os.tmpdir(), "emulator-stale-down-"));
  const scripts = path.join(project, "scripts/emulator");
  const statePath = path.join(project, ".tmp/emulator/state.json");
  mkdirSync(scripts, { recursive: true });
  mkdirSync(path.dirname(statePath), { recursive: true });
  for (const name of ["stack.mjs", "startup-ownership.mjs"]) {
    copyFileSync(
      fileURLToPath(new URL(`./${name}`, import.meta.url)),
      path.join(scripts, name),
    );
  }
  const held = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    detached: true,
    stdio: "ignore",
  });
  const heldExit = once(held, "exit");
  let stopping;
  try {
    writeFileSync(
      statePath,
      JSON.stringify({
        ownerToken: "stale",
        runDir: path.join(project, "gone"),
        pids: [held.pid],
      }),
    );
    stopping = spawn(
      process.execPath,
      [path.join(scripts, "stack.mjs"), "down", "--owner-token", "stale"],
      { stdio: "ignore" },
    );
    assert.deepEqual(await once(stopping, "exit"), [0, null]);
    assert.deepEqual(await heldExit, [null, "SIGTERM"]);
    assert.equal(existsSync(statePath), false);
  } finally {
    stopping?.kill("SIGKILL");
    held.kill("SIGKILL");
    rmSync(project, { recursive: true, force: true });
  }
}, 5000);
