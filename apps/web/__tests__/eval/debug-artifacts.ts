import * as fs from "node:fs";
import * as path from "node:path";
import { expect } from "vitest";

export function writeEvalDebugArtifact({
  kind,
  data,
}: {
  kind: string;
  data: unknown;
}) {
  const debugDir = getEvalDebugDir();
  if (!debugDir) return null;

  fs.mkdirSync(debugDir, { recursive: true });

  const fileName = [
    new Date().toISOString().replace(/[:.]/g, "-"),
    process.pid,
    Math.random().toString(36).slice(2, 8),
    slugify(getCurrentTestName()),
    slugify(kind),
  ].join("--");

  const filePath = path.join(debugDir, `${fileName}.json`);
  fs.writeFileSync(filePath, `${JSON.stringify(data, jsonReplacer, 2)}\n`);

  return filePath;
}

function getEvalDebugDir() {
  if (
    process.env.EVAL_DEBUG_ARTIFACTS !== "true" &&
    !process.env.EVAL_DEBUG_DIR
  )
    return null;

  const repoRoot = findRepoRoot(process.cwd());

  if (process.env.EVAL_DEBUG_DIR) {
    return path.resolve(repoRoot, process.env.EVAL_DEBUG_DIR);
  }

  return path.resolve(repoRoot, ".context/eval-debug");
}

function getCurrentTestName() {
  return expect.getState().currentTestName || "unknown-test";
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function jsonReplacer(_key: string, value: unknown) {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (typeof value === "bigint") return value.toString();
  if (value instanceof Set) return Array.from(value);
  if (value instanceof Map) return Object.fromEntries(value);

  return value;
}

function findRepoRoot(startDir: string) {
  let currentDir = path.resolve(startDir);

  while (true) {
    if (hasRepoMarkers(currentDir)) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return path.resolve(startDir);
    }

    currentDir = parentDir;
  }
}

function hasRepoMarkers(dir: string) {
  return (
    fs.existsSync(path.join(dir, "pnpm-workspace.yaml")) &&
    fs.existsSync(path.join(dir, "turbo.json")) &&
    fs.existsSync(path.join(dir, "apps/web/package.json"))
  );
}
