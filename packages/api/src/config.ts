import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";

export const CONFIG_PATH = resolve(homedir(), ".inbox-zero-api", "config.json");
export const DEFAULT_BASE_URL = "https://www.getinboxzero.com";

export type ApiCliConfig = {
  apiKey?: string;
  baseUrl?: string;
};

export type RuntimeOptions = {
  apiKey?: string;
  baseUrl?: string;
};

export function loadConfig(configPath = CONFIG_PATH): ApiCliConfig {
  if (!existsSync(configPath)) return {};

  const raw = readFileSync(configPath, "utf8").trim();
  if (!raw) return {};

  return JSON.parse(raw) as ApiCliConfig;
}

export function saveConfig(
  config: ApiCliConfig,
  configPath = CONFIG_PATH,
): void {
  const configDir = dirname(configPath);
  const configDirExists = existsSync(configDir);

  mkdirSync(configDir, { recursive: true, mode: 0o700 });
  if (!configDirExists || configPath === CONFIG_PATH) {
    chmodSync(configDir, 0o700);
  }
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, {
    mode: 0o600,
  });
  chmodSync(configPath, 0o600);
}

export function updateConfig(
  partial: Partial<ApiCliConfig>,
  configPath = CONFIG_PATH,
): ApiCliConfig {
  const nextConfig = {
    ...loadConfig(configPath),
    ...partial,
  };

  saveConfig(nextConfig, configPath);

  return nextConfig;
}

export function resolveRuntimeConfig(
  options: RuntimeOptions,
  env: NodeJS.ProcessEnv = process.env,
  storedConfig: ApiCliConfig = loadConfig(),
): Required<ApiCliConfig> {
  const apiKey =
    options.apiKey || env.INBOX_ZERO_API_KEY || storedConfig.apiKey;
  const baseUrl =
    options.baseUrl ||
    env.INBOX_ZERO_BASE_URL ||
    storedConfig.baseUrl ||
    DEFAULT_BASE_URL;

  if (!apiKey) {
    throw new Error(
      "Missing API key. Set --api-key, INBOX_ZERO_API_KEY, or configure it with `inbox-zero-api config set api-key ...`.",
    );
  }

  return {
    apiKey,
    baseUrl,
  };
}
