import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import {
  batchPlaywrightTargets,
  expandPlaywrightTargets,
  getPlaywrightSpecPathFromTargetName,
  getPlaywrightTargetName,
} from "./emulated-suite-targets.mjs";

const appRoot = mkdtempSync(path.join(os.tmpdir(), "playwright-targets-"));
afterEach(() => rmSync(appRoot, { recursive: true, force: true }));

test("isolates every selected spec once, including nested specs and overlapping targets", () => {
  const mail = "__tests__/playwright/emulated/mail";
  mkdirSync(path.join(appRoot, mail, "nested"), { recursive: true });
  mkdirSync(path.join(appRoot, mail, "foo"), { recursive: true });
  for (const file of [
    "foo.bar.spec.ts",
    "foo/bar.spec.ts",
    "foo_sbar.spec.ts",
    "reply.spec.ts",
    "list.spec.ts",
    "helper.ts",
    "unsupported.spec.tsx",
    "unsupported.spec.js",
    "nested/offline.spec.ts",
  ]) {
    writeFileSync(path.join(appRoot, mail, file), "");
  }
  const targets = expandPlaywrightTargets(
    [mail, `${mail}/reply.spec.ts`],
    appRoot,
  );
  expect(targets.map((target) => target.path)).toEqual([
    `${mail}/foo.bar.spec.ts`,
    `${mail}/foo/bar.spec.ts`,
    `${mail}/foo_sbar.spec.ts`,
    `${mail}/list.spec.ts`,
    `${mail}/nested/offline.spec.ts`,
    `${mail}/reply.spec.ts`,
  ]);
  expect(new Set(targets.map((target) => target.name)).size).toBe(6);
});

test("target names round-trip spec paths that contain underscores", () => {
  for (const specPath of [
    "mail/theme.spec.ts",
    "mail/nested/split_tabs.spec.ts",
    "auto_s/s_flow.spec.ts",
  ]) {
    const targetName = getPlaywrightTargetName(
      `__tests__/playwright/emulated/${specPath}`,
    );
    expect(targetName).not.toContain("/");
    expect(getPlaywrightSpecPathFromTargetName(targetName)).toBe(specPath);
  }
});

test("feature groups preserve every selected spec, including unassigned and nested specs", () => {
  const paths = [
    "mail/compose-and-reply.spec.ts",
    "mail/contact-autocomplete.spec.ts",
    "mail/offline-outbox.spec.ts",
    "mail/new-behavior.spec.ts",
    "mail/nested/new-behavior.spec.ts",
    "settings/appearance.spec.ts",
  ];
  const targets = paths.map((spec) => ({
    name: getPlaywrightTargetName(spec),
    path: `__tests__/playwright/emulated/${spec}`,
  }));
  const batches = batchPlaywrightTargets(targets);
  expect(batches.flatMap(({ paths }) => paths).sort()).toEqual(
    targets.map(({ path }) => path).sort(),
  );
  expect(batches.find(({ name }) => name === "mail-compose")?.paths).toEqual(
    targets.slice(0, 2).map(({ path }) => path),
  );
  expect(batches.find(({ name }) => name === "mail")?.paths).toEqual(
    targets.slice(3, 5).map(({ path }) => path),
  );
  expect(new Set(batches.map(({ name }) => name)).size).toBe(batches.length);
});

test("focused selections keep their feature names without adding unselected specs", () => {
  expect(batchPlaywrightTargets([])).toEqual([]);
  const target = {
    name: "mail_scontact-autocomplete.spec.ts",
    path: "__tests__/playwright/emulated/mail/contact-autocomplete.spec.ts",
  };
  expect(batchPlaywrightTargets([target])).toEqual([
    { name: "mail-compose", paths: [target.path], timeoutMinutes: 12 },
  ]);
});

test.each([
  0, 1,
])("the batch runner preserves reports and isolation after a spec exits %i", (exitStatus) => {
  const runner = path.resolve(
    import.meta.dirname,
    "../../__tests__/playwright/run-emulated-suite.mjs",
  );
  const specs = [
    "automation/first.spec.ts",
    "mail/second.spec.ts",
    "settings/third.spec.ts",
  ];
  for (const spec of specs) {
    const file = path.join(appRoot, "__tests__/playwright/emulated", spec);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, "");
  }
  const bin = path.join(appRoot, "bin");
  mkdirSync(bin, { recursive: true });
  const pnpm = path.join(bin, "pnpm");
  writeFileSync(
    pnpm,
    `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const env = process.env;
fs.appendFileSync(env.CALL_LOG, JSON.stringify({
  args: process.argv.slice(2),
  runId: env.PLAYWRIGHT_RUN_ID,
  debug: env.DEBUG,
  blob: env.PLAYWRIGHT_BLOB_REPORT_FILE,
  output: env.PLAYWRIGHT_OUTPUT_DIR,
  todoist: env.PLAYWRIGHT_TODOIST_ENABLED,
  api: env.NEXT_PUBLIC_EXTERNAL_API_ENABLED,
}) + "\\n");
if (process.argv.includes("test")) {
  fs.mkdirSync(path.dirname(env.PLAYWRIGHT_BLOB_REPORT_FILE), { recursive: true });
  fs.writeFileSync(env.PLAYWRIGHT_BLOB_REPORT_FILE, "report");
  fs.mkdirSync(env.PLAYWRIGHT_OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(env.PLAYWRIGHT_OUTPUT_DIR, "evidence.json"), "{}");
  process.exit(process.argv.at(-1).includes("first.spec.ts") ? ${exitStatus} : 0);
}
`,
  );
  chmodSync(pnpm, 0o755);
  const callLog = path.join(appRoot, "calls.jsonl");
  const summary = path.join(appRoot, "summary.md");
  const result = spawnSync(process.execPath, [runner, ...specs], {
    cwd: appRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      CALL_LOG: callLog,
      CI: "true",
      DEBUG: "pw:api",
      GITHUB_STEP_SUMMARY: summary,
      PLAYWRIGHT_DRY_RUN: "",
      PLAYWRIGHT_SKIP_REPORT_MERGE: "",
      PLAYWRIGHT_RUN_ID: "",
      PLAYWRIGHT_TODOIST_ENABLED: "",
      NEXT_PUBLIC_EXTERNAL_API_ENABLED: "",
    },
  });

  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(exitStatus);
  const calls = readFileSync(callLog, "utf8")
    .trim()
    .split("\n")
    .map(JSON.parse);
  const runs = calls.filter(({ args }) => args.includes("test"));
  expect(runs.map(({ args }) => args.at(-1))).toEqual(
    specs.map((spec) => `__tests__/playwright/emulated/${spec}`),
  );
  expect(new Set(runs.map(({ runId }) => runId)).size).toBe(3);
  expect(runs.map(({ todoist, api }) => [todoist, api])).toEqual([
    ["true", ""],
    ["", ""],
    ["", "true"],
  ]);
  for (const run of runs) {
    expect(run.args).toContain("--global-timeout=480000");
    expect(run.debug).toBe("pw:api,pw:webserver");
    expect(existsSync(run.blob)).toBe(true);
    expect(existsSync(path.join(run.output, "evidence.json"))).toBe(true);
  }
  expect(calls.at(-1).args).toContain("merge-reports");
  const timings = readdirSync(path.join(appRoot, "test-results"))
    .filter((file) => file.startsWith("timings-"))
    .sort()
    .flatMap((file) =>
      JSON.parse(
        readFileSync(path.join(appRoot, "test-results", file), "utf8"),
      ),
    );
  expect(timings).toHaveLength(3);
  expect(timings.map(({ status }) => status)).toEqual([exitStatus, 0, 0]);
  for (const spec of specs)
    expect(readFileSync(summary, "utf8")).toContain(spec);
});
