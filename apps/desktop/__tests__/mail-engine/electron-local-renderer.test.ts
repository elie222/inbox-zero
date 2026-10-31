import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import {
  buildMailUiCss,
  withMailUiStylesheet,
} from "../../scripts/mail-ui-css.mjs";
import { describe, expect, it } from "vitest";
import {
  electronBinaryPath,
  electronCommand,
  hasElectronBinary,
} from "./electron-binary";

describe.skipIf(!hasElectronBinary())("desktop local mail renderer", () => {
  it("boots MailApp from bundled assets and archives without Next", async () => {
    const harness = await buildLocalMailHarness();
    try {
      const payload = await launchLocalMail(harness, {});
      expect(payload.url).toContain("file:");
      expect(payload.subjects).toContain("Local Mail Example");
      expect(payload.inboxAfterArchive).toBe(0);
      expect(payload.invalidRequests).toBe(0);
    } finally {
      await rm(harness.directory, { recursive: true, force: true });
    }
  }, 90_000);

  it("reads beyond the first page of a long conversation", async () => {
    const harness = await buildLocalMailHarness();
    try {
      const payload = await launchLocalMail(harness, {
        ELECTRON_LONG_THREAD: "1",
        ELECTRON_SKIP_ARCHIVE: "1",
        ELECTRON_EXPECTED_INBOX: "1",
      });
      expect(payload.inboxCount).toBe(1);
      expect(payload.invalidRequests).toBe(0);
    } finally {
      await rm(harness.directory, { recursive: true, force: true });
    }
  }, 90_000);

  it("reopens an archived mailbox offline from native SQLite", async () => {
    const harness = await buildLocalMailHarness();
    const mailboxDir = await mkdtemp(join(tmpdir(), "electron-offline-mail-"));
    try {
      const archived = await launchLocalMail(harness, {
        ELECTRON_MAILBOX_DIR: mailboxDir,
        ELECTRON_STAY_SUBJECT: "Stay Local",
        ELECTRON_ARCHIVE_SUBJECT: "Archive Local",
        ELECTRON_EXPECTED_SUBJECTS: "Stay Local|Archive Local",
        ELECTRON_EXPECTED_INBOX: "1",
      });
      expect(archived.subjects).toEqual(
        expect.arrayContaining(["Stay Local", "Archive Local"]),
      );
      expect(archived.inboxAfterArchive).toBe(1);

      const reopened = await launchLocalMail(harness, {
        ELECTRON_MAILBOX_DIR: mailboxDir,
        ELECTRON_SKIP_SEED: "1",
        ELECTRON_SKIP_ARCHIVE: "1",
        ELECTRON_EXPECTED_SUBJECTS: "Stay Local",
        ELECTRON_EXPECTED_INBOX: "1",
      });
      expect(reopened.url).toContain("file:");
      expect(reopened.subjects).toContain("Stay Local");
      expect(reopened.subjects).not.toContain("Archive Local");
      expect(reopened.inboxCount).toBe(1);
    } finally {
      await rm(harness.directory, { recursive: true, force: true });
      await rm(mailboxDir, { recursive: true, force: true });
    }
  }, 90_000);
});

async function buildLocalMailHarness() {
  const directory = await mkdtemp(join(tmpdir(), "electron-local-mail-"));
  const rendererDir = join(directory, "renderer");
  await mkdir(rendererDir, { recursive: true });
  await buildMailUiCss({ outFile: join(rendererDir, "mail-ui.css") });
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
    withMailUiStylesheet(
      await readFile(
        join(
          dirname(fileURLToPath(import.meta.url)),
          "../../src/renderer/index.html",
        ),
        "utf8",
      ),
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
  return {
    directory,
    outfile,
    preload,
    rendererHtml: join(rendererDir, "index.html"),
    electronBin: electronBinaryPath,
  };
}

async function launchLocalMail(
  harness: Awaited<ReturnType<typeof buildLocalMailHarness>>,
  extraEnv: Record<string, string>,
) {
  const output = await runElectron(harness.electronBin, harness.outfile, {
    ELECTRON_PRELOAD: harness.preload,
    ELECTRON_RENDERER_HTML: harness.rendererHtml,
    ...extraEnv,
  });
  const line = output
    .split("\n")
    .find((item) => item.startsWith("ELECTRON_LOCAL_MAIL "));
  return JSON.parse(line?.slice("ELECTRON_LOCAL_MAIL ".length) ?? "{}") as {
    url?: string;
    subjects?: string[];
    inboxAfterArchive?: number;
    inboxCount?: number;
    invalidRequests?: number;
  };
}

function runElectron(
  binary: string,
  script: string,
  extraEnv: Record<string, string>,
) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(...electronCommand(binary, [script, "--no-sandbox"]), {
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
