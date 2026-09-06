import { readdirSync, statSync } from "node:fs";
import path from "node:path";

export function expandPlaywrightTargets(paths, appRoot) {
  const files = new Set();
  for (const targetPath of paths) {
    for (const file of getSpecFiles(targetPath, appRoot)) files.add(file);
  }
  return [...files].sort().map((file) => ({
    name: file
      .replace(/^__tests__\/playwright\/emulated\//, "")
      .replaceAll("_", "__")
      .replaceAll("/", "_s"),
    path: file,
  }));
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
