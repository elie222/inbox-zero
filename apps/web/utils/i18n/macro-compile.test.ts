import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = path.resolve(import.meta.dirname, "../..");
const require = createRequire(path.join(appRoot, "package.json"));

// A macro that doesn't resolve to a component's i18n falls back to the global
// instance, which has no locale in the app, so it throws in production.
// Example: a nested `plural()` inside `t` written as a direct JSX child.
describe("Lingui macros", () => {
  it("never compile to the global i18n instance", async () => {
    const swc = require("next/dist/build/swc");
    await swc.loadBindings();
    const plugin = require.resolve("@lingui/swc-plugin");

    const offenders: string[] = [];
    for (const file of getFilesUsingCoreMacros()) {
      const source = readFileSync(path.join(appRoot, file), "utf8");
      const { code } = await swc.transform(source, {
        filename: file,
        jsc: {
          parser: { syntax: "typescript", tsx: file.endsWith(".tsx") },
          target: "es2022",
          experimental: { plugins: [[plugin, {}]] },
        },
      });
      if (/import \{[^}]*\bi18n\b[^}]*\} from "@lingui\/core"/.test(code)) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  }, 120_000);
});

function getFilesUsingCoreMacros() {
  const output = execFileSync(
    "git",
    ["grep", "-l", "@lingui/core/macro", "--", "*.ts", "*.tsx"],
    { cwd: appRoot, encoding: "utf8" },
  );
  return output
    .split("\n")
    .filter(
      (file) => file && !file.includes(".test.") && !file.includes("__tests__"),
    );
}
