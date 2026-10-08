import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { createLocalEnvironment } from "./environment";

test("isolates local development from inherited production credentials and URLs", () => {
  const env = createLocalEnvironment({
    appPort: 3000,
    databasePort: 5433,
    redisPort: 6380,
    redisHttpPort: 8079,
    googlePort: 4002,
    microsoftPort: 4003,
    llmPort: 4006,
    stripePort: 4005,
    secrets: {
      database: "db",
      auth: "auth",
      encryption: "encryption",
      redis: "redis",
    },
    inherited: {
      PATH: "/usr/bin",
      DATABASE_URL: "postgresql://production/db",
      PREVIEW_DATABASE_URL: "postgresql://production/preview",
      DEFAULT_LLMS: "openai:live",
      OPENAI_API_KEY: "production-key",
      OAUTH_PROXY_URL: "https://production.example.com",
      QSTASH_TOKEN: "production-queue",
      VERCEL_ENV: "preview",
      NODE_OPTIONS: "--import unwanted-loader",
    },
  });

  expect(env.PATH).toBe("/usr/bin");
  expect(new URL(env.DATABASE_URL).hostname).toBe("127.0.0.1");
  expect(env.PREVIEW_DATABASE_URL).toBe(env.DATABASE_URL);
  expect(env.PREVIEW_DATABASE_URL_UNPOOLED).toBe(env.DATABASE_URL);
  expect(env.DIRECT_URL).toBe(env.DATABASE_URL);
  expect(env.DATABASE_URL_UNPOOLED).toBe(env.DATABASE_URL);
  expect(env.DEFAULT_LLMS).toBe("openai-compatible:emulated");
  for (const key of [
    "OPENAI_API_KEY",
    "OAUTH_PROXY_URL",
    "QSTASH_TOKEN",
    "VERCEL_ENV",
  ]) {
    expect(env[key]).toBeUndefined();
  }
  expect(env.NODE_OPTIONS).not.toContain("unwanted-loader");
  expect(env.__NEXT_PROCESSED_ENV).toBe("true");
});

test("Next does not import credentials from an existing checkout environment file", () => {
  const directory = mkdtempSync(join(tmpdir(), "local-dev-env-"));
  const require = createRequire(import.meta.url);
  const nextRequire = createRequire(require.resolve("next/package.json"));
  const envLoader = nextRequire.resolve("@next/env");
  writeFileSync(
    join(directory, ".env.local"),
    "OPENAI_API_KEY=live-key\nOAUTH_PROXY_URL=https://production.example.com\n",
  );
  try {
    const result = spawnSync(
      process.execPath,
      [
        "-e",
        `require(${JSON.stringify(envLoader)}).loadEnvConfig(${JSON.stringify(directory)}, true); console.log(JSON.stringify({key:process.env.OPENAI_API_KEY,proxy:process.env.OAUTH_PROXY_URL}));`,
      ],
      {
        env: { NODE_ENV: "development", __NEXT_PROCESSED_ENV: "true" },
        encoding: "utf8",
        timeout: 5000,
      },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({});
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("keeps credentials valid when constructing the database URL", () => {
  const env = createLocalEnvironment({
    appPort: 3100,
    databasePort: 5433,
    redisPort: 6380,
    redisHttpPort: 8079,
    googlePort: 4002,
    microsoftPort: 4003,
    llmPort: 4006,
    stripePort: 4005,
    secrets: {
      database: "password/@:#",
      auth: "auth",
      encryption: "encryption",
      redis: "redis",
    },
    inherited: {},
  });
  const databaseUrl = new URL(env.DATABASE_URL);
  expect(decodeURIComponent(databaseUrl.password)).toBe("password/@:#");
  expect(databaseUrl.pathname).toBe("/inboxzero_local");
  expect(env.NEXT_PUBLIC_BASE_URL).toBe("http://localhost:3100");
});
