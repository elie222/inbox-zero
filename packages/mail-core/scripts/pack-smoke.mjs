#!/usr/bin/env node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const packagesRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const packages = ["mail-core", "mail-sqlite", "mail-react", "mail-ui"];
const forbidden = ["prisma", "next/", "electron", "@prisma"];

const directory = await mkdtemp(join(tmpdir(), "mail-pack-"));
try {
  for (const name of packages) {
    const { stdout } = await exec(
      "pnpm",
      ["pack", "--pack-destination", directory],
      {
        cwd: join(packagesRoot, name),
        env: process.env,
      },
    );
    const packed = stdout.trim().split("\n").at(-1) ?? "";
    const tarball = packed.endsWith(".tgz")
      ? packed
      : join(directory, `${name}.tgz`);
    const listing = await exec("tar", [
      "-tf",
      tarball.startsWith("/")
        ? tarball
        : join(directory, packed.split("/").at(-1) ?? packed),
    ]);
    const contents = listing.stdout;
    for (const token of forbidden) {
      if (contents.includes(token)) {
        throw new Error(`${name} pack contains forbidden token ${token}`);
      }
    }
    if (!contents.includes("package.json")) {
      throw new Error(`${name} pack is missing package.json`);
    }
  }
  console.log("mail package pack smoke passed");
} finally {
  await rm(directory, { recursive: true, force: true });
}
