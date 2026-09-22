import { copyFile, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { rewriteRelativeImports } from "./rewrite-relative-imports.mjs";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryDirectory = resolve(packageDirectory, "../..");
const outputDirectory = resolve(packageDirectory, "dist");
const packageJson = JSON.parse(
  await readFile(resolve(packageDirectory, "package.json"), "utf8"),
);

const publishedExports = Object.fromEntries(
  Object.entries(packageJson.exports).map(([name, source]) => {
    if (
      typeof source !== "string" ||
      !(source.startsWith("./src/") || source.startsWith("./test-support/"))
    ) {
      throw new Error(`Unsupported package export: ${name}`);
    }

    const output = source.replace(/^\.\//u, "").replace(/\.ts$/u, "");
    return [
      name,
      {
        types: `./${output}.d.ts`,
        import: `./${output}.js`,
        "react-native": `./${output}.js`,
        default: `./${output}.js`,
      },
    ];
  }),
);

const publishedPackageJson = {
  name: packageJson.name,
  version: packageJson.version,
  description: packageJson.description,
  homepage: packageJson.homepage,
  bugs: packageJson.bugs,
  repository: packageJson.repository,
  license: "SEE LICENSE IN LICENSE",
  type: packageJson.type,
  sideEffects: packageJson.sideEffects,
  exports: publishedExports,
  dependencies: rewriteWorkspaceDependencies(packageJson.dependencies),
  peerDependencies: packageJson.peerDependencies,
  publishConfig: { access: "public" },
};

await rewriteRelativeImports(outputDirectory);

await Promise.all([
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

function rewriteWorkspaceDependencies(dependencies) {
  if (!dependencies) return;
  return Object.fromEntries(
    Object.entries(dependencies).map(([name, version]) => [
      name,
      version === "workspace:*" ? packageJson.version : version,
    ]),
  );
}
