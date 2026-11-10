import { defineConfig } from "@lingui/conf";
import { formatter } from "@lingui/format-po";

export default defineConfig({
  sourceLocale: "en",
  locales: ["en", "es"],
  catalogs: [
    {
      path: "<rootDir>/locales/{locale}/messages",
      include: ["app", "components", "hooks", "providers", "utils"],
      exclude: ["**/*.test.*", "**/__tests__/**"],
    },
  ],
  // Keep file paths in `#:` origins but drop line numbers, so an edit that
  // shifts lines in a large file doesn't rewrite every locale catalog.
  format: formatter({ lineNumbers: false }),
});
