// Offline stub for next/font/google. The Nix sandbox has no network, so we
// serve the CSS + woff2 files vendored in this directory instead of fetching
// from Google Fonts. Load via NODE_OPTIONS="--require .../font-mock.cjs".
//
// Next's google font loader requires its fetch helpers by relative path
// (require("./fetch-css-from-google-fonts")), so we match on the basename of
// the resolved module rather than a fixed module id.
const Module = require("module");
const fs = require("fs");
const path = require("path");

const FONT_DIR = __dirname;

const cssStub = {
  async fetchCSSFromGoogleFonts(_url, fontFamily) {
    return fs.readFileSync(path.join(FONT_DIR, `${fontFamily}.css`), "utf8");
  },
};
const fileStub = {
  async fetchFontFile(url) {
    return fs.readFileSync(path.join(FONT_DIR, path.basename(url)));
  },
};

function stubFor(request) {
  if (request.endsWith("fetch-css-from-google-fonts")) return cssStub;
  if (request.endsWith("fetch-font-file")) return fileStub;
  return null;
}

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  const stub = stubFor(request);
  if (stub) return stub;
  return origLoad.call(this, request, parent, isMain);
};

// `next` ships no "exports" map, so ESM `import "next/constants"` (from
// @sentry/nextjs) fails under Node's strict resolver in the pnpm store layout.
// Add the extension the CJS resolver would have supplied.
if (typeof Module.registerHooks === "function") {
  Module.registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === "next/constants") {
        return nextResolve("next/constants.js", context);
      }
      return nextResolve(specifier, context);
    },
  });
}
