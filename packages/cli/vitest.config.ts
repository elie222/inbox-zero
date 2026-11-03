import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Use threads pool for cleaner exit
    pool: "threads",
    fileParallelism: false,
    // bun.lock gives this package a different lockfile hash than the rest of
    // the workspace, so sharing the root cache makes parallel runs wipe it.
    fsModuleCachePath: "node_modules/.vitest-cache",
  },
});
