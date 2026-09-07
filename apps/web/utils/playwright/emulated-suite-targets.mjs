import { readdirSync, statSync } from "node:fs";
import path from "node:path";

export function expandPlaywrightTargets(paths, appRoot) {
  const files = new Set();
  for (const targetPath of paths) {
    for (const file of getSpecFiles(targetPath, appRoot)) files.add(file);
  }
  return [...files].sort().map((file) => ({
    name: getPlaywrightTargetName(file),
    path: file,
  }));
}

export function batchPlaywrightTargets(targets) {
  const batchCount = Math.min(targets.length, 12);
  const batches = Array.from({ length: batchCount }, (_, index) => ({
    name:
      targets.length <= batchCount ? targets[index].name : `batch-${index + 1}`,
    paths: [],
  }));
  // Spread neighboring specs across runners so one large area cannot monopolize a job.
  for (const [index, target] of targets.entries()) {
    batches[index % batchCount].paths.push(target.path);
  }
  return batches;
}

/**
 * Result directories are named after the spec path with `/` encoded as `_s`.
 * Existing underscores double up first so the encoding stays reversible.
 */
export function getPlaywrightTargetName(specPath) {
  return specPath
    .replace(/^__tests__\/playwright\/emulated\//, "")
    .replaceAll("_", "__")
    .replaceAll("/", "_s");
}

export function getPlaywrightSpecPathFromTargetName(targetName) {
  let specPath = "";
  for (let index = 0; index < targetName.length; index += 1) {
    if (targetName[index] !== "_") {
      specPath += targetName[index];
      continue;
    }
    const next = targetName[index + 1];
    if (next === "_") {
      specPath += "_";
      index += 1;
    } else if (next === "s") {
      specPath += "/";
      index += 1;
    } else {
      specPath += "_";
    }
  }
  return specPath;
}

function getSpecFiles(targetPath, appRoot) {
  const absolutePath = path.resolve(appRoot, targetPath);
  if (statSync(absolutePath).isFile()) {
    return targetPath.endsWith(".spec.ts") ? [targetPath] : [];
  }
  return readdirSync(absolutePath, { withFileTypes: true }).flatMap((entry) =>
    getSpecFiles(`${targetPath}/${entry.name}`, appRoot),
  );
}
