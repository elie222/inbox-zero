import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const forbidden = [
  /from\s+["']react-dom/,
  /from\s+["']next/,
  /from\s+["']@inboxzero\/mail-sqlite/,
  /from\s+["']electron/,
];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else if ([".ts", ".tsx"].includes(extname(entry.name))) files.push(path);
  }
  return files;
}

const violations = [];
for (const file of await walk(join(packageDirectory, "src"))) {
  if (file.endsWith(".test.ts") || file.endsWith(".test.tsx")) continue;
  const source = await readFile(file, "utf8");
  for (const pattern of forbidden) {
    if (pattern.test(source)) violations.push(`${file}: ${pattern}`);
  }
}
if (violations.length) {
  console.error(violations.join("\n"));
  process.exit(1);
}
