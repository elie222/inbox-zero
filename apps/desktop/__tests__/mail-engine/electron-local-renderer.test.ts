import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { describe, expect, it } from "vitest";

describe("desktop local mail renderer", () => {
  it("boots MailApp from bundled assets and archives without Next", async () => {
    const directory = await mkdtemp(join(tmpdir(), "electron-local-mail-"));
    const rendererDir = join(directory, "renderer");
    await mkdir(rendererDir, { recursive: true });
    await esbuild.build({
      entryPoints: [
        join(
          dirname(fileURLToPath(import.meta.url)),
          "../../src/renderer/main.tsx",
        ),
      ],
      outfile: join(rendererDir, "main.js"),
      bundle: true,
      platform: "browser",
      format: "iife",
      jsx: "automatic",
      target: "chrome120",
      define: { "process.env.NODE_ENV": '"production"' },
    });
    await writeFile(
      join(rendererDir, "index.html"),
      await readFile(
        join(
          dirname(fileURLToPath(import.meta.url)),
          "../../src/renderer/index.html",
        ),
        "utf8",
      ),
    );
    const preload = join(directory, "preload.cjs");
    await esbuild.build({
      entryPoints: [
        join(dirname(fileURLToPath(import.meta.url)), "../../src/preload.ts"),
      ],
      outfile: preload,
      bundle: true,
      platform: "node",
      format: "cjs",
      external: ["electron"],
    });
    const outfile = join(directory, "electron-local-renderer.mjs");
    await esbuild.build({
      entryPoints: [
        join(
          dirname(fileURLToPath(import.meta.url)),
          "electron-local-renderer-entry.ts",
        ),
      ],
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
    const output = await runElectron(electronBin, outfile, {
      ELECTRON_PRELOAD: preload,
      ELECTRON_RENDERER_HTML: join(rendererDir, "index.html"),
    });
    expect(output).toContain("ELECTRON_LOCAL_MAIL");
    const line = output
      .split("\n")
      .find((item) => item.startsWith("ELECTRON_LOCAL_MAIL "));
    const payload = JSON.parse(
      line?.slice("ELECTRON_LOCAL_MAIL ".length) ?? "{}",
    );
    expect(payload.url).toContain("file:");
    expect(payload.subjects).toContain("Local Mail Example");
    expect(payload.inboxAfterArchive).toBe(0);
    await rm(directory, { recursive: true, force: true });
  }, 90_000);
});

function runElectron(
  binary: string,
  script: string,
  extraEnv: Record<string, string>,
) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn("xvfb-run", ["-a", binary, script, "--no-sandbox"], {
      env: {
        ...process.env,
        ...extraEnv,
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
      reject(new Error(`electron local mail timed out\n${stdout}\n${stderr}`));
    }, 70_000);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 && stdout.includes("ELECTRON_LOCAL_MAIL")) {
        resolve(stdout);
        return;
      }
      reject(
        new Error(`electron local mail exited ${code}\n${stdout}\n${stderr}`),
      );
    });
  });
}
