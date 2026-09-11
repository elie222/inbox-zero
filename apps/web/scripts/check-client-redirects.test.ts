import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const scriptPath = path.join(
  process.cwd(),
  "scripts/check-client-redirects.js",
);

let testRoot: string;

beforeEach(async () => {
  testRoot = await mkdtemp(path.join(tmpdir(), "client-redirect-check-"));
  await writeSource("utils/redirect.ts", "window.location.assign('/allowed');");
});

afterEach(async () => {
  await rm(testRoot, { recursive: true, force: true });
});

describe("check-client-redirects", () => {
  it("rejects globalThis location redirects", async () => {
    await writeSource(
      "components/Redirect.tsx",
      "export function redirect(url: string) { globalThis.location.href = url; }",
    );

    await expect(runCheck()).rejects.toMatchObject({
      stdout: "",
      stderr: expect.stringContaining("components/Redirect.tsx:1"),
    });
  });

  it("ignores redirect sink text in comments and strings", async () => {
    await writeSource(
      "components/Copy.tsx",
      `
        const example = "window.location.href = '/billing'";
        // globalThis.location.assign('/billing')
        export const text = example;
      `,
    );

    await expect(runCheck()).resolves.toMatchObject({
      stdout: expect.stringContaining(
        "Client redirects use the safe redirect helper.",
      ),
    });
  });
});

async function runCheck() {
  return execFileAsync("node", [scriptPath], { cwd: testRoot });
}

async function writeSource(relativePath: string, content: string) {
  const filePath = path.join(testRoot, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
}
