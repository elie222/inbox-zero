import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // SQLite tests share this job with real Electron processes. On a busy
    // runner they can pass 5s without being stuck; a sibling test took 4.7s
    // in the same run that timed this suite out at the default.
    testTimeout: 20_000,
  },
});
