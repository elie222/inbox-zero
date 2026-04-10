import { existsSync } from "node:fs";
import { config } from "dotenv";
import { configDefaults, defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

const isE2E = process.env.RUN_E2E_FLOW_TESTS === "true";
const envFile = isE2E ? "./.env.e2e" : "./.env.test";
const env = existsSync(envFile) ? config({ path: envFile }).parsed : undefined;

export default defineConfig({
  plugins: [tsconfigPaths()],
  // Vitest runs outside Next, so it must compile JSX instead of inheriting
  // Next's tsconfig `jsx: "preserve"` setting.
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "node",
    setupFiles: ["./__tests__/setup.ts"],
    exclude: [...configDefaults.exclude, "__tests__/playwright/**"],
    env: {
      ...env,
    },
  },
});
