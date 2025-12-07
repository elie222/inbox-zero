import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Use threads pool for cleaner exit
    pool: "threads",
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
  },
});
