// @ts-check
import { serwist } from "@serwist/next/config";

// Built by `serwist build` after `next build` (see the build scripts).
// Static assets are precached; app/sw.ts also keeps an offline mailbox shell.
const config = await serwist({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, // 3MB
  // The webpack plugin this replaces never precached prerendered HTML.
  precachePrerendered: false,
});

// The default static-asset extensions omit the search worker's WASM binary.
config.globPatterns = config.globPatterns?.map((pattern) =>
  pattern.replace(/\.\{([^}]+)\}$/u, ".{$1,wasm}"),
);
export default config;
