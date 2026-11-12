import { defineConfig } from "@lingui/conf";
import { formatter } from "@lingui/format-po";

// Public landing pages get their own small catalog, so marketing visitors
// don't download every app message. The private marketing submodule keeps its
// own catalog (see app/(marketing)/lingui.config.ts when present).
const LANDING_SOURCES = [
  "app/(app)/premium/config-messages.ts",
  "app/(landing)/home",
  "app/(landing)/l",
  "app/(landing)/page.tsx",
  "app/(landing)/pricing",
  "components/layouts",
  "components/new-landing",
];

export default defineConfig({
  sourceLocale: "en",
  locales: ["en", "es", "fr", "de", "pt-BR"],
  catalogs: [
    {
      path: "<rootDir>/locales/{locale}/messages",
      include: ["app", "components", "hooks", "lib", "providers", "utils"],
      exclude: [
        "**/*.test.*",
        "**/__tests__/**",
        "app/(marketing)",
        ...LANDING_SOURCES,
      ],
    },
    {
      path: "<rootDir>/locales/{locale}/landing",
      include: LANDING_SOURCES,
      exclude: ["**/*.test.*", "**/__tests__/**"],
    },
  ],
  // Keep file paths in `#:` origins but drop line numbers, so an edit that
  // shifts lines in a large file doesn't rewrite every locale catalog.
  format: formatter({ lineNumbers: false }),
});
