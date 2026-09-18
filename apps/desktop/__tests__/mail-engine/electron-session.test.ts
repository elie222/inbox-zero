import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { describe, expect, it } from "vitest";

describe("desktop electron mail session", () => {
  it("starts a real Electron process that owns native SQLite", async () => {
    const directory = await mkdtemp(join(tmpdir(), "electron-session-"));
    const entry = join(
      dirname(fileURLToPath(import.meta.url)),
      "electron-session-entry.ts",
    );
    const outfile = join(directory, "electron-session.mjs");
    await esbuild.build({
      entryPoints: [entry],
      outfile,
      bundle: true,
      platform: "node",
      format: "esm",
      external: ["electron"],
    });
    const electronBin = join(
      dirname(fileURLToPath(import.meta.url)),
      "../../node_modules/electron/dist/electron",
    );
    const output = await runElectron(electronBin, outfile);
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
    expect(payload.diagnostics).toMatchObject({
      status: "ok",
      result: { accountId: "acc-1" },
    });
    await rm(directory, { recursive: true, force: true });
  }, 60_000);
});

function runElectron(binary: string, script: string) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn("xvfb-run", ["-a", binary, script, "--no-sandbox"], {
      env: {
        ...process.env,
        ELECTRON_ENABLE_LOGGING: "1",
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
