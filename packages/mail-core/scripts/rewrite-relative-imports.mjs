import { readdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

export async function rewriteRelativeImports(directory) {
  for (const file of await walkJs(directory)) {
    const source = await readFile(file, "utf8");
    const next = source.replace(
      /(from\s+|import\s*\(\s*)["'](\.[^"']+)["']/gu,
      (match, prefix, spec) => {
        if (/\.(?:js|json|mjs|cjs|node)$/u.test(spec)) return match;
        return `${prefix}"${spec}.js"`;
      },
    );
    if (next !== source) await writeFile(file, next);
  }
}

async function walkJs(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkJs(path)));
      continue;
    }
    if (extname(entry.name) === ".js") files.push(path);
  }
  return files;
}
