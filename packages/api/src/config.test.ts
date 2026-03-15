import { chmodSync, mkdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_BASE_URL,
  loadConfig,
  resolveRuntimeConfig,
  updateConfig,
} from "./config";

describe("loadConfig", () => {
  it("returns an empty object when the config file does not exist", () => {
    const missingConfigPath = join(
      tmpdir(),
      `inbox-zero-api-missing-${process.pid}-${Date.now()}.json`,
    );

    expect(loadConfig(missingConfigPath)).toEqual({});
  });
});

describe("updateConfig", () => {
  const configDir = join(tmpdir(), `inbox-zero-api-config-${process.pid}`);
  const configPath = join(configDir, "config.json");

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(configDir, { recursive: true, force: true });
  });

  it("merges new values with the existing config file", () => {
    updateConfig(
      {
        baseUrl: "https://www.getinboxzero.com",
      },
      configPath,
    );

    const updated = updateConfig(
      {
        apiKey: "iz_test_key",
      },
      configPath,
    );

    expect(updated).toEqual({
      apiKey: "iz_test_key",
      baseUrl: "https://www.getinboxzero.com",
    });
  });

  it("does not tighten an existing custom parent directory", () => {
    mkdirSync(configDir, { recursive: true, mode: 0o755 });
    chmodSync(configDir, 0o755);

    updateConfig(
      {
        apiKey: "iz_test_key",
      },
      configPath,
    );

    expect(statSync(configDir).mode & 0o777).toBe(0o755);
  });

  it("prefers flags over environment variables and stored config", () => {
    vi.stubEnv("INBOX_ZERO_API_KEY", "env-key");
    vi.stubEnv("INBOX_ZERO_BASE_URL", "https://env.example.com");

    const resolved = resolveRuntimeConfig(
      {
        apiKey: "flag-key",
        baseUrl: "https://flag.example.com",
      },
      process.env,
      {
        apiKey: "stored-key",
        baseUrl: "https://stored.example.com",
      },
    );

    expect(resolved).toEqual({
      apiKey: "flag-key",
      baseUrl: "https://flag.example.com",
    });
  });

  it("falls back from flags to environment variables and stored config", () => {
    vi.stubEnv("INBOX_ZERO_API_KEY", "env-key");

    const resolved = resolveRuntimeConfig({}, process.env, {
      apiKey: "stored-key",
      baseUrl: "https://stored.example.com",
    });

    expect(resolved).toEqual({
      apiKey: "env-key",
      baseUrl: "https://stored.example.com",
    });
  });

  it("throws when the API key is missing", () => {
    expect(() =>
      resolveRuntimeConfig({ baseUrl: "https://www.getinboxzero.com" }, {}, {}),
    ).toThrow("Missing API key");
  });

  it("uses the hosted site as the default base URL", () => {
    expect(resolveRuntimeConfig({ apiKey: "iz_test_key" }, {}, {})).toEqual({
      apiKey: "iz_test_key",
      baseUrl: DEFAULT_BASE_URL,
    });
  });
});
