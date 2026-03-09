import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { defineConfig } from "sanity";

const currentDir =
  typeof import.meta.dirname === "string" ? import.meta.dirname : process.cwd();
const localRequire =
  typeof require === "function"
    ? require
    : createRequire(path.join(currentDir, "sanity.config.ts"));
const marketingSanityConfigPath = path.join(
  currentDir,
  "app",
  "(marketing)",
  "sanity",
  "sanity.config",
);

// Self-hosted installs may not have access to the private marketing repo.
const sanityConfig = hasMarketingSanityConfig()
  ? localRequire(marketingSanityConfigPath).default
  : defineConfig({
      basePath: "/studio",
      dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || "production",
      plugins: [],
      projectId:
        process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ||
        "missing-marketing-project",
      schema: { types: [] },
    });

export default sanityConfig;

function hasMarketingSanityConfig() {
  return [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].some((extension) =>
    existsSync(`${marketingSanityConfigPath}${extension}`),
  );
}
