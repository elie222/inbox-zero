import { config } from "dotenv";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

const isE2E = process.env.RUN_E2E_FLOW_TESTS === "true";
const envFile = isE2E ? "./.env.e2e" : "./.env.test";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    setupFiles: ["./__tests__/setup.ts"],
    env: {
      ...config({ path: envFile }).parsed,
    },
  },
});
