import path from "node:path";
import { defineConfig } from "@playwright/test";
import baseConfig from "../../../playwright.config.mjs";

const providerUrl = process.env.GOOGLE_BASE_URL;
const providerAddress = new URL(providerUrl);
if (
  providerAddress.protocol !== "http:" ||
  !["127.0.0.1", "localhost"].includes(providerAddress.hostname) ||
  !providerAddress.port
) {
  throw new Error(
    "Mail simulation requires a local HTTP GOOGLE_BASE_URL with an explicit port",
  );
}

export default defineConfig({
  ...baseConfig,
  outputDir:
    process.env.PLAYWRIGHT_OUTPUT_DIR ?? ".tmp/mail-simulation/test-results",
  testDir: path.resolve("__tests__/playwright"),
  projects: [
    baseConfig.projects[0],
    {
      name: "mail-simulation",
      dependencies: ["emulated-setup"],
      testDir: path.resolve("__tests__/playwright/mail-simulation"),
      testMatch: "loading.spec.ts",
      use: { storageState: process.env.PLAYWRIGHT_AUTH_FILE },
    },
  ],
  reporter: [
    ["list"],
    [
      "html",
      {
        open: "never",
        outputFolder:
          process.env.MAIL_SIMULATION_REPORT_DIR ??
          ".tmp/mail-simulation/report",
      },
    ],
  ],
  webServer: baseConfig.webServer.map((server) => ({
    ...server,
    reuseExistingServer: false,
    ...(server.url === `${providerUrl}/.well-known/openid-configuration`
      ? {
          command: `node __tests__/playwright/mail-simulation/server.mjs ${providerAddress.port}`,
        }
      : {}),
  })),
});
