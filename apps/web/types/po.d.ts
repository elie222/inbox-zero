// Lingui catalogs, compiled at import time by @lingui/loader (Next) and
// @lingui/vite-plugin (Vitest).
declare module "*.po" {
  import type { Messages } from "@lingui/core";

  export const messages: Messages;
}
