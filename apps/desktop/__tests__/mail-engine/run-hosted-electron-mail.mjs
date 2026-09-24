import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const desktopRoot = join(here, "../..");
const electronBin = createRequire(import.meta.url)("electron");

const directory = await mkdtemp(join(tmpdir(), "electron-hosted-mail-"));
const userData =
  process.env.ELECTRON_USER_DATA ??
  (await mkdtemp(join(tmpdir(), "electron-hosted-data-")));
const createdUserData = !process.env.ELECTRON_USER_DATA;

try {
  if (!existsSync(electronBin)) {
    throw new Error(`Electron binary missing at ${electronBin}`);
  }
  const preload = join(directory, "preload.cjs");
  await esbuild.build({
    entryPoints: [join(desktopRoot, "src/preload.ts")],
    outfile: preload,
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["electron"],
  });
  const outfile = join(directory, "electron-hosted-renderer.mjs");
  await esbuild.build({
    entryPoints: [join(here, "electron-hosted-renderer-entry.ts")],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    external: ["electron"],
  });
  const output = await runElectron(electronBin, outfile, {
    ELECTRON_PRELOAD: preload,
    ELECTRON_USER_DATA: userData,
  });
  process.stdout.write(output);
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
} finally {
  await rm(directory, { recursive: true, force: true });
  if (createdUserData) {
    await rm(userData, { recursive: true, force: true });
  }
}

function runElectron(binary, script, extraEnv) {
  return new Promise((resolve, reject) => {
    const useXvfb = process.platform === "linux";
    const child = spawn(
      useXvfb ? "xvfb-run" : binary,
      useXvfb ? ["-a", binary, script, "--no-sandbox"] : [script],
      {
        env: {
          ...process.env,
          ...extraEnv,
          ELECTRON_ENABLE_LOGGING: "1",
        },
      },
    );
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
      reject(new Error(`electron hosted mail timed out\n${stdout}\n${stderr}`));
    }, 240_000);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 && stdout.includes("ELECTRON_HOSTED_MAIL")) {
        resolve(stdout);
        return;
      }
      reject(
        new Error(`electron hosted mail exited ${code}\n${stdout}\n${stderr}`),
      );
    });
  });
}
