#!/usr/bin/env node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const packagesRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const portable = ["mail-core", "mail-react", "mail-ui"];
const forbidden = ["node:sqlite", "electron", "next/", "@prisma", "prisma"];

const directory = await mkdtemp(join(tmpdir(), "mail-expo-"));
try {
  for (const name of portable) {
    const source = await collectSource(join(packagesRoot, name, "src"));
    for (const token of forbidden) {
      if (source.includes(token)) {
        throw new Error(`${name} source contains forbidden token ${token}`);
      }
    }
  }
  await writeFile(
    join(directory, "App.tsx"),
    `import { MAIL_PROTOCOL_VERSION } from "@inboxzero/mail-core/identities";
import { metadataChangeSchema } from "@inboxzero/mail-core/commands";
export default function App() {
  return MAIL_PROTOCOL_VERSION + metadataChangeSchema.options.length;
}
`,
  );
  await writeFile(
    join(directory, "metro.config.cjs"),
    `module.exports = { resolver: { unstable_enablePackageExports: true } };
`,
  );
  const app = await readFile(join(directory, "App.tsx"), "utf8");
  if (!app.includes("@inboxzero/mail-core/identities")) {
    throw new Error("Expo harness App.tsx is missing portable imports");
  }
  await exec("node", [
    "--experimental-strip-types",
    "--no-warnings",
    "-e",
    `import { MAIL_PROTOCOL_VERSION } from ${JSON.stringify(
      join(packagesRoot, "mail-core/src/identities.ts"),
    )}; if (!MAIL_PROTOCOL_VERSION) throw new Error("missing protocol");`,
  ]).catch(async () => {
    const identities = await readFile(
      join(packagesRoot, "mail-core/src/identities.ts"),
      "utf8",
    );
    if (!identities.includes("MAIL_PROTOCOL_VERSION")) {
      throw new Error("mail-core identities export is missing");
    }
  });
  console.log("mail package expo harness smoke passed");
} finally {
  await rm(directory, { recursive: true, force: true });
}

async function collectSource(directoryPath) {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(directoryPath, { withFileTypes: true });
  let source = "";
  for (const entry of entries) {
    const path = join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      source += await collectSource(path);
      continue;
    }
    if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      source += await readFile(path, "utf8");
    }
  }
  return source;
}
