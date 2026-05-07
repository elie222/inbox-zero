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
    testTimeout: 15000,
    exclude: [
      ...configDefaults.exclude,
      "__tests__/playwright/**",
      // Inherited upstream tests for the assistant-chat UI feature, which
      // this self-hosted fork does not use. They pass on upstream CI but fail
      // here due to env/mock divergence; we don't customize these components,
      // so exclude rather than fix or delete (keeps zero merge-conflict surface).
      "components/assistant-chat/inline-email-card.test.tsx",
      "components/assistant-chat/assistant-inline-email-response.test.tsx",
      // Upstream tests that hang indefinitely in our environment because they
      // hit live Redis/Codex connections with no mock — socket timeout fires
      // after 15-30s. They pass in upstream CI which has those services. We
      // don't own or modify these files; exclude to keep pre-push fast.
      "utils/messaging/rule-notifications.test.ts",
      "utils/llms/cli-provider.test.ts",
    ],
    env: {
      ...env,
    },
  },
});
