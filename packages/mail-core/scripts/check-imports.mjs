import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const forbidden = [
  /from\s+["']react(?:\/|$)/,
  /from\s+["']react-dom/,
  /from\s+["']next(?:\/|$)/,
  /from\s+["']electron(?:\/|$)/,
  /from\s+["']expo(?:\/|$)/,
  /from\s+["']@prisma\//,
  /from\s+["']prisma/,
  /from\s+["']ioredis/,
  /from\s+["']node:/,
  /\bindexedDB\b/,
  /\bdocument\b/,
  /\bnavigator\b/,
  /\bwindow\b/,
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
    if (extname(entry.name) === ".ts" && !entry.name.endsWith(".test.ts")) {
      files.push(path);
    }
  }
  return files;
}

const files = await walk(join(packageDirectory, "src"));
const violations = [];
for (const file of files) {
  const source = await readFile(file, "utf8");
  for (const pattern of forbidden) {
    if (pattern.test(source)) {
      violations.push(`${file}: matched ${pattern}`);
    }
  }
}

if (violations.length) {
  console.error(violations.join("\n"));
  process.exit(1);
}
