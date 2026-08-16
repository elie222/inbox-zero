import * as esbuild from "esbuild";
import { ESM_MAIN_REQUIRE_BANNER } from "./esm-main-banner.mjs";

const shared = {
  bundle: true,
  platform: "node",
  target: "node22",
  external: ["electron"],
  sourcemap: true,
};

await esbuild.build({
  ...shared,
  entryPoints: ["src/main.ts"],
  outfile: "dist/main.js",
  format: "esm",
  // electron-updater and fs-extra are CJS. esbuild rewrites their require("fs")
  // calls to a helper that throws in ESM unless require exists in this module.
  banner: { js: ESM_MAIN_REQUIRE_BANNER },
});

await esbuild.build({
  ...shared,
  entryPoints: ["src/preload.ts"],
  outfile: "dist/preload.cjs",
  format: "cjs",
});
