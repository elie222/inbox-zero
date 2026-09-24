import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { describe, expect, it } from "vitest";
import { desktopEsbuildShared } from "../../esm-main-banner.mjs";
import {
  electronBinaryPath,
  electronCommand,
  hasElectronBinary,
} from "./electron-binary";

describe.skipIf(!hasElectronBinary())("desktop electron mail session", () => {
  it("runs native SQLite in a utility process behind the main-process owner", async () => {
    const directory = await mkdtemp(join(tmpdir(), "electron-session-"));
    const here = dirname(fileURLToPath(import.meta.url));
    const entry = join(here, "electron-session-entry.ts");
    const childOutfile = join(directory, "mail-engine-child.js");
    await esbuild.build({
      ...desktopEsbuildShared,
      entryPoints: [join(here, "../../src/mail-engine/utility-child-entry.ts")],
      outfile: childOutfile,
      format: "esm",
      sourcemap: false,
    });
    const outfile = join(directory, "electron-session.mjs");
    await esbuild.build({
      entryPoints: [entry],
      outfile,
      bundle: true,
      platform: "node",
      format: "esm",
      external: ["electron"],
    });
    const output = await runElectron(electronBinaryPath, outfile, childOutfile);
    expect(output).toContain("ELECTRON_MAIL_SMOKE");
    const line = output
      .split("\n")
      .find((item) => item.startsWith("ELECTRON_MAIL_SMOKE "));
    expect(line).toBeTruthy();
    const payload = JSON.parse(
      line?.slice("ELECTRON_MAIL_SMOKE ".length) ?? "{}",
    );
    expect(payload.electron).toMatch(/^\d+\.\d+\.\d+/);
    expect(payload.admitted).toMatchObject({
      status: "ok",
      result: { status: "queued" },
    });
    expect(payload.duplicate).toMatchObject({
      status: "ok",
      result: { status: "already_recorded" },
    });
    expect(payload.health).toMatchObject({
      running: true,
      child: { sqliteWriteMs: { count: expect.any(Number) } },
    });
    // Recovered from a killed child: restarted, resubscribed, same database.
    expect(payload.restarted).toBe(true);
    expect(payload.diagnostics).toMatchObject({
      status: "ok",
      result: { accountId: "acc-1" },
    });
    expect(payload.wiped).toBe(true);
    await rm(directory, { recursive: true, force: true });
  }, 60_000);
});

function runElectron(binary: string, script: string, childModule: string) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(...electronCommand(binary, [script, "--no-sandbox"]), {
      env: {
        ...process.env,
        ELECTRON_ENABLE_LOGGING: "1",
        ELECTRON_MAIL_CHILD: childModule,
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`electron session timed out\n${stdout}\n${stderr}`));
    }, 45_000);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 && stdout.includes("ELECTRON_MAIL_SMOKE")) {
        resolve(stdout);
        return;
      }
      reject(
        new Error(`electron session exited ${code}\n${stdout}\n${stderr}`),
      );
    });
  });
}
