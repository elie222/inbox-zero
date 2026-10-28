import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const availableProfiles = ["latency", "published-quota", "constrained"];
const profiles =
  process.argv.length > 2 ? process.argv.slice(2) : availableProfiles;
if (profiles.some((profile) => !availableProfiles.includes(profile))) {
  throw new Error(`Choose profiles from: ${availableProfiles.join(", ")}`);
}
const output = path.resolve(".tmp/mail-simulation", String(Date.now()));
let failed = false;
for (const profile of profiles) {
  const destination = path.join(output, profile);
  mkdirSync(destination, { recursive: true });
  const result = spawnSync(
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    [
      "exec",
      "playwright",
      "test",
      "--config",
      "__tests__/playwright/mail-simulation/playwright.config.mjs",
      "--project=mail-simulation",
    ],
    {
      stdio: "inherit",
      shell: process.platform === "win32",
      env: {
        ...process.env,
        MAIL_SIMULATION_PROFILE: profile,
        MAIL_SIMULATION_REPORT_DIR: path.join(destination, "playwright-report"),
        PLAYWRIGHT_OUTPUT_DIR: path.join(destination, "test-results"),
        PLAYWRIGHT_RUN_ID: `${process.pid}-${profile}-${Date.now()}`,
      },
    },
  );
  writeFileSync(
    path.join(destination, "run.json"),
    JSON.stringify(
      { profile, status: result.status, error: result.error?.message },
      null,
      2,
    ),
  );
  if (result.status !== 0) failed = true;
}
console.log(`Mail simulation artifacts: ${output}`);
process.exitCode = failed ? 1 : 0;
