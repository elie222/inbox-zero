import { copyFile, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { rewriteRelativeImports } from "../../mail-core/scripts/rewrite-relative-imports.mjs";

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
    const output = source.slice("./src/".length).replace(/\.tsx?$/u, "");
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
    `${JSON.stringify(
      {
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
        dependencies: publishDependencies(
          packageJson.dependencies,
          packageJson.version,
        ),
        peerDependencies: packageJson.peerDependencies,
        publishConfig: { access: "public" },
      },
      null,
      2,
    )}\n`,
  ),
]);

function publishDependencies(dependencies, version) {
  if (!dependencies) return undefined;
  return Object.fromEntries(
    Object.entries(dependencies).map(([name, range]) => [
      name,
      typeof range === "string" && range.startsWith("workspace:")
        ? version
        : range,
    ]),
  );
}
