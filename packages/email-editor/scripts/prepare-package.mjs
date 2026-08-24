import { copyFile, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryDirectory = resolve(packageDirectory, "../..");
const outputDirectory = resolve(packageDirectory, "dist");
const packageJson = JSON.parse(
  await readFile(resolve(packageDirectory, "package.json"), "utf8"),
);

const publishedExports = Object.fromEntries(
  Object.entries(packageJson.exports).map(([name, source]) => {
    if (typeof source !== "string" || !source.startsWith("./src/")) {
      throw new Error(`Unsupported package export: ${name}`);
    }

    const output = source.slice("./src/".length).replace(/\.(?:ts|tsx)$/u, "");
    return [
      name,
      {
        types: `./${output}.d.ts`,
        import: `./${output}.js`,
        default: `./${output}.js`,
      },
    ];
  }),
);

const publishedPackageJson = {
  name: packageJson.name,
  version: packageJson.version,
  description: packageJson.description,
  keywords: packageJson.keywords,
  homepage: packageJson.homepage,
  bugs: packageJson.bugs,
  repository: packageJson.repository,
  license: "SEE LICENSE IN LICENSE",
  type: packageJson.type,
  sideEffects: packageJson.sideEffects,
  exports: publishedExports,
  dependencies: packageJson.dependencies,
  peerDependencies: packageJson.peerDependencies,
  peerDependenciesMeta: packageJson.peerDependenciesMeta,
  publishConfig: { access: "public" },
};

await Promise.all([
  copyFile(
    resolve(packageDirectory, "src/web/EmailEditor.module.css"),
    resolve(outputDirectory, "web/EmailEditor.module.css"),
  ),
  copyFile(
    resolve(packageDirectory, "README.md"),
    resolve(outputDirectory, "README.md"),
  ),
  copyFile(
    resolve(repositoryDirectory, "LICENSE"),
    resolve(outputDirectory, "LICENSE"),
  ),
  writeFile(
    resolve(outputDirectory, "package.json"),
    `${JSON.stringify(publishedPackageJson, null, 2)}\n`,
  ),
]);
