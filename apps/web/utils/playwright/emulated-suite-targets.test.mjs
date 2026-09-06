import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { expandPlaywrightTargets } from "./emulated-suite-targets.mjs";

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
