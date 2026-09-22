import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const portableFiles = [
  "driver.ts",
  "migrations.ts",
  "store.ts",
  "rows.ts",
  "queries.ts",
  "commands.ts",
  "observations.ts",
  "drafts.ts",
  "maintenance.ts",
  "capabilities.ts",
  "client-reads.ts",
  "mailbox-view-readers.ts",
  "store-read-utils.ts",
];
const forbidden = [
  /from\s+["']react/,
  /from\s+["']next/,
  /from\s+["']electron/,
  /from\s+["']better-sqlite3/,
  /from\s+["']@sqlite.org\/sqlite-wasm/,
  /from\s+["']node:/,
  /from\s+["']expo/,
];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(path)));
      continue;
    }
    if (extname(entry.name) === ".ts") files.push(path);
  }
  return files;
}

const files = (await walk(join(packageDirectory, "src"))).filter((file) =>
  portableFiles.includes(file.split("/").at(-1) ?? ""),
);
const violations = [];
for (const file of files) {
  const source = await readFile(file, "utf8");
  for (const pattern of forbidden) {
    if (pattern.test(source)) violations.push(`${file}: ${pattern}`);
  }
}
if (violations.length) {
  console.error(violations.join("\n"));
  process.exit(1);
}
