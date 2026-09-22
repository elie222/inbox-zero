import { mkdir, readFile, writeFile } from "node:fs/promises";
import * as esbuild from "esbuild";
import {
  desktopEsbuildShared,
  ESM_MAIN_REQUIRE_BANNER,
} from "./esm-main-banner.mjs";
import {
  buildMailUiCss,
  withMailUiStylesheet,
} from "./scripts/mail-ui-css.mjs";

await esbuild.build({
  ...desktopEsbuildShared,
  entryPoints: ["src/main.ts"],
  outfile: "dist/main.js",
  format: "esm",
  // electron-updater and fs-extra are CJS. esbuild rewrites their require("fs")
  // calls to a helper that throws in ESM unless require exists in this module.
  banner: { js: ESM_MAIN_REQUIRE_BANNER },
});

await esbuild.build({
  ...desktopEsbuildShared,
  entryPoints: ["src/preload.ts"],
  outfile: "dist/preload.cjs",
  format: "cjs",
});

await esbuild.build({
  ...desktopEsbuildShared,
  entryPoints: ["src/mail-engine/utility-child.ts"],
  outfile: "dist/mail-engine-child.js",
  format: "esm",
});

await mkdir("dist/renderer", { recursive: true });
await buildMailUiCss({ outFile: "dist/renderer/mail-ui.css" });
await esbuild.build({
  entryPoints: ["src/renderer/main.tsx"],
  outfile: "dist/renderer/main.js",
  bundle: true,
  platform: "browser",
  format: "iife",
  jsx: "automatic",
  target: "chrome120",
  sourcemap: true,
  define: { "process.env.NODE_ENV": '"production"' },
});
await writeFile(
  "dist/renderer/index.html",
  withMailUiStylesheet(await readFile("src/renderer/index.html", "utf8")),
);
