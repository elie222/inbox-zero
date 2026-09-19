import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { electronBinaryPath, hasElectronBinary } from "./electron-binary";

const desktopRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const packagedBin = join(
  desktopRoot,
  "release/linux-unpacked/@inboxzerodesktop",
);
const hostedMailUrl = "https://www.getinboxzero.com/account-1/mail?type=inbox";

describe.skipIf(!hasElectronBinary())(
  "desktop packaged local mail renderer",
  () => {
    beforeAll(() => {
      const result = spawnSync(process.execPath, ["esbuild.config.mjs"], {
        cwd: desktopRoot,
        encoding: "utf8",
      });
      if (result.status !== 0) {
        throw new Error(
          `desktop build failed\n${result.stdout}\n${result.stderr}`,
        );
      }
    }, 60_000);
    it("boots product main from bundled assets and ignores a restored hosted window", async () => {
      const payload = await launchLocalMailSmoke(electronBinaryPath, [
        "--no-sandbox",
        "dist/main.js",
      ]);
      expect(payload.url).toContain("file:");
      expect(payload.url).toContain("renderer/index.html");
      expect(payload.url).not.toContain("getinboxzero.com");
      expect(payload.compose).toBe(true);
    }, 90_000);

    it.skipIf(!existsSync(packagedBin))(
      "launches the linux-unpacked product binary without hosted Next",
      async () => {
        const payload = await launchLocalMailSmoke(packagedBin, [
          "--no-sandbox",
        ]);
        expect(payload.url).toContain("file:");
        expect(payload.url).toContain("renderer/index.html");
        expect(payload.url).not.toContain("getinboxzero.com");
        expect(payload.compose).toBe(true);
      },
      90_000,
    );
  },
);

async function launchLocalMailSmoke(binary: string, extraArgs: string[]) {
  const userData = await mkdtemp(join(tmpdir(), "electron-local-mail-user-"));
  await writeFile(
    join(userData, "windows.json"),
    JSON.stringify([
      {
        url: hostedMailUrl,
        bounds: { x: 0, y: 0, width: 1280, height: 840 },
        isMaximized: false,
      },
    ]),
  );
  const output = await runElectron(binary, extraArgs, userData);
  await rm(userData, { recursive: true, force: true });
  const line = output
    .split("\n")
    .find((item) => item.startsWith("ELECTRON_PACKAGED_LOCAL_MAIL "));
  return JSON.parse(
    line?.slice("ELECTRON_PACKAGED_LOCAL_MAIL ".length) ?? "{}",
  ) as { url?: string; compose?: boolean };
}

function runElectron(binary: string, extraArgs: string[], userData: string) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(
      "xvfb-run",
      ["-a", binary, `--user-data-dir=${userData}`, ...extraArgs],
      {
        cwd: desktopRoot,
        env: {
          ...process.env,
          ELECTRON_ENABLE_LOGGING: "1",
          INBOX_ZERO_LOCAL_MAIL: "1",
          INBOX_ZERO_LOCAL_MAIL_SMOKE: "1",
        },
      },
    );
    let stdout = "";
    let stderr = "";
    let settled = false;
    const settle = (ok: boolean, code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      if (ok) {
        resolve(stdout);
        return;
      }
      reject(
        new Error(
          `electron packaged local mail exited ${code}\n${stdout}\n${stderr}`,
        ),
      );
    };
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
      if (stdout.includes("ELECTRON_PACKAGED_LOCAL_MAIL")) settle(true, 0);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    const timer = setTimeout(() => {
      settle(false, null);
    }, 70_000);
    child.on("error", (error) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    child.on("close", (code) => {
      if (stdout.includes("ELECTRON_PACKAGED_LOCAL_MAIL")) {
        settle(true, code);
        return;
      }
      settle(false, code);
    });
  });
}
