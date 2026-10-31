export const ESM_MAIN_REQUIRE_BANNER =
  'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);';

/** @type {import("esbuild").BuildOptions} */
export const desktopEsbuildShared = {
  bundle: true,
  platform: "node",
  target: "node22",
  external: ["electron"],
  sourcemap: true,
};
