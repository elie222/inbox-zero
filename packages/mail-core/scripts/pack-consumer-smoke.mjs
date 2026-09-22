#!/usr/bin/env node
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const packagesRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const names = ["mail-core", "mail-sqlite", "mail-react"];
const forbiddenPackTokens = ["prisma", "next/", "electron", "@prisma"];
const portableForbidden = [
  'from "node:',
  "from 'node:",
  'require("node:',
  "require('node:",
  'from "react-dom',
  "from 'react-dom",
  'from "next',
  "from 'next",
  'from "expo',
  "from 'expo",
  'from "electron',
  "from 'electron",
];
const hermesForbidden = ["await using ", " using {", "with {", "import assert"];

const directory = await mkdtemp(join(tmpdir(), "mail-pack-consumer-"));
try {
  const tarballs = [];
  for (const name of names) {
    const pkg = join(packagesRoot, name);
    await exec(process.execPath, ["scripts/clean-package.mjs"], { cwd: pkg });
    await exec(
      join(pkg, "node_modules/.bin/tsc"),
      ["-p", "tsconfig.build.json"],
      {
        cwd: pkg,
      },
    );
    await exec(process.execPath, ["scripts/prepare-package.mjs"], { cwd: pkg });
    const dist = join(pkg, "dist");
    const packed = await exec(
      "npm",
      ["pack", "--pack-destination", directory],
      {
        cwd: dist,
        env: process.env,
      },
    );
    const line = packed.stdout.trim().split("\n").at(-1) ?? "";
    const tarball = line.endsWith(".tgz")
      ? line.startsWith("/")
        ? line
        : join(directory, line.split("/").at(-1) ?? line)
      : join(directory, `${name}.tgz`);
    tarballs.push({ name, tarball });
    const listing = await exec("tar", ["-tf", tarball]);
    for (const token of forbiddenPackTokens) {
      if (listing.stdout.includes(token)) {
        throw new Error(`${name} pack contains forbidden token ${token}`);
      }
    }
    if (!listing.stdout.includes("package.json")) {
      throw new Error(`${name} pack is missing package.json`);
    }
    if (!listing.stdout.includes("LICENSE")) {
      throw new Error(`${name} pack is missing LICENSE`);
    }
    const manifest = JSON.parse(
      await extractPackedFile(tarball, "package/package.json"),
    );
    for (const value of Object.values(manifest.dependencies ?? {})) {
      if (String(value).startsWith("workspace:")) {
        throw new Error(
          `${name} packed dependencies still use workspace protocol`,
        );
      }
    }
    await assertPortablePackedJs(name, tarball, listing.stdout);
  }

  const consumer = join(directory, "consumer");
  await mkdir(consumer, { recursive: true });
  await writeFile(
    join(consumer, "package.json"),
    `${JSON.stringify(
      {
        name: "mail-pack-consumer",
        private: true,
        type: "module",
        dependencies: Object.fromEntries(
          tarballs.map((item) => [
            `@inboxzero/${item.name}`,
            `file:${item.tarball}`,
          ]),
        ),
      },
      null,
      2,
    )}\n`,
  );
  await exec("npm", ["install", "--omit=dev"], {
    cwd: consumer,
    env: process.env,
  });
  await writeFile(
    join(consumer, "smoke.mjs"),
    `import { createHostRuntime, createMailEngine } from "@inboxzero/mail-core/engine";
import { canonicalJson, hashCanonical, webCryptoSha256 } from "@inboxzero/mail-core/canonical";
import { mailboxPredicate } from "@inboxzero/mail-core/queries";
import { createMemoryBlobStore } from "@inboxzero/mail-core/memory-blob-store";
import { createSqliteMailStore } from "@inboxzero/mail-sqlite/store";
import { probeSqliteCapabilities } from "@inboxzero/mail-sqlite/capabilities";
if (canonicalJson({ b: 1, a: 2 }) !== '{"a":2,"b":1}') throw new Error("canonical");
if (mailboxPredicate("inbox").mailbox !== "inbox") throw new Error("predicate");
const digest = await hashCanonical({ kind: "send" }, webCryptoSha256);
if (!/^[0-9a-f]{64}$/.test(digest)) throw new Error("hash");
const blobStore = createMemoryBlobStore();
if (!blobStore.stage || !createHostRuntime || !createMailEngine || !createSqliteMailStore || !probeSqliteCapabilities) {
  throw new Error("missing export");
}
console.log("pack consumer smoke ok");
`,
  );
  const ran = await exec("node", ["smoke.mjs"], {
    cwd: consumer,
    env: process.env,
  });
  if (!ran.stdout.includes("pack consumer smoke ok")) {
    throw new Error("consumer smoke did not print success");
  }
  console.log(
    "mail package consumer smoke passed (static/package + node import)",
  );
  console.log(
    "Hermes/Metro: portable packed JS was scanned; this is not a native runtime.",
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}

async function extractPackedFile(tarball, path) {
  const result = await exec("tar", ["-xOf", tarball, path]);
  return result.stdout;
}

async function assertPortablePackedJs(name, tarball, listing) {
  const skip = new Set([
    "package/src/node-sqlite.js",
    "package/src/blob-store.js",
  ]);
  const files = listing
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.endsWith(".js") && !skip.has(line));
  for (const file of files) {
    if (name === "mail-sqlite" && file.includes("/node-sqlite.js")) continue;
    if (name === "mail-sqlite" && file.includes("/blob-store.js")) continue;
    const source = await extractPackedFile(tarball, file);
    for (const token of portableForbidden) {
      if (name === "mail-react" && token.includes("react-dom")) continue;
      if (source.includes(token)) {
        throw new Error(
          `${name} ${file} contains portable-forbidden token ${token}`,
        );
      }
    }
    for (const token of hermesForbidden) {
      if (source.includes(token)) {
        throw new Error(
          `${name} ${file} contains Hermes-incompatible syntax ${token}`,
        );
      }
    }
  }
}
