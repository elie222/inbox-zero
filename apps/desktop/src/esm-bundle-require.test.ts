import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as esbuild from "esbuild";
import { describe, expect, it } from "vitest";
import { ESM_MAIN_REQUIRE_BANNER } from "../esm-main-banner.mjs";

const DYNAMIC_FS_CJS =
  'module.exports = { exists: require("fs" + "").existsSync };\n';

async function bundleFixture(dir: string, banner?: string) {
  writeFileSync(path.join(dir, "dep.cjs"), DYNAMIC_FS_CJS);
  writeFileSync(
    path.join(dir, "entry.js"),
    'import dep from "./dep.cjs"; export const exists = dep.exists(".");\n',
  );
  const outfile = path.join(dir, "out.mjs");
  await esbuild.build({
    bundle: true,
    platform: "node",
    format: "esm",
    entryPoints: [path.join(dir, "entry.js")],
    outfile,
    ...(banner ? { banner: { js: banner } } : {}),
  });
  return outfile;
}

describe("esm main bundle require banner", () => {
  it("is applied to the Electron main process build", () => {
    const config = readFileSync(
      new URL("../esbuild.config.mjs", import.meta.url),
      "utf8",
    );
    expect(config).toContain("ESM_MAIN_REQUIRE_BANNER");
    expect(config).toContain('format: "esm"');
  });

  it("lets bundled CJS dependencies require node builtins", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "desktop-esm-require-"));
    try {
      const outfile = await bundleFixture(dir, ESM_MAIN_REQUIRE_BANNER);
      const mod = (await import(pathToFileURL(outfile).href)) as {
        exists: boolean;
      };
      expect(mod.exists).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("throws without the banner when Node loads the ESM bundle", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "desktop-esm-require-"));
    try {
      const outfile = await bundleFixture(dir);
      const result = spawnSync(process.execPath, [outfile], {
        encoding: "utf8",
      });
      expect(result.status).not.toBe(0);
      expect(`${result.stderr}${result.stdout}`).toMatch(
        /Dynamic require of "fs" is not supported/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
