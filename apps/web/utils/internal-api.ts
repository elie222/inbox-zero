import { env } from "@/env";
import { hash } from "@/utils/hash";
import type { Logger } from "@/utils/logger";

export const INTERNAL_API_KEY_HEADER = "x-api-key";
export const INTERNAL_CALLER_ID_HEADER = "x-inbox-zero-caller-id";
export const INTERNAL_CALLER_APP_HEADER = "x-inbox-zero-caller-app";
export const INTERNAL_CALLER_RUNTIME_HEADER = "x-inbox-zero-caller-runtime";
export const INTERNAL_CALLER_BASE_URL_HOST_HEADER =
  "x-inbox-zero-caller-base-url-host";
export const INTERNAL_CALLER_REPO_HEADER = "x-inbox-zero-caller-repo";
export const INTERNAL_CALLER_DEPLOYMENT_URL_HEADER =
  "x-inbox-zero-caller-deployment-url";
export const INTERNAL_CALLER_GIT_COMMIT_HEADER =
  "x-inbox-zero-caller-git-commit";

export function getInternalApiUrl(): string {
  const url = env.INTERNAL_API_URL || env.NEXT_PUBLIC_BASE_URL;

  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return `https://${url}`;
  }

  return url;
}

export function getInternalApiHeaders(): Record<string, string> {
  const callerMetadata = getInternalCallerMetadata();

  return {
    [INTERNAL_API_KEY_HEADER]: env.INTERNAL_API_KEY,
    [INTERNAL_CALLER_ID_HEADER]: callerMetadata.id,
    [INTERNAL_CALLER_APP_HEADER]: callerMetadata.app,
    [INTERNAL_CALLER_RUNTIME_HEADER]: callerMetadata.runtime,
    [INTERNAL_CALLER_BASE_URL_HOST_HEADER]: callerMetadata.baseUrlHost,
    ...(callerMetadata.repo
      ? { [INTERNAL_CALLER_REPO_HEADER]: callerMetadata.repo }
      : {}),
    ...(callerMetadata.deploymentUrl
      ? {
          [INTERNAL_CALLER_DEPLOYMENT_URL_HEADER]: callerMetadata.deploymentUrl,
        }
      : {}),
    ...(callerMetadata.gitCommit
      ? { [INTERNAL_CALLER_GIT_COMMIT_HEADER]: callerMetadata.gitCommit }
      : {}),
  };
}

export const isValidInternalApiKey = (
  headers: Headers,
  logger: Logger,
): boolean => {
  if (!env.INTERNAL_API_KEY) {
    logger.error("No internal API key set");
    return false;
  }
  const apiKey = headers.get(INTERNAL_API_KEY_HEADER);
  const isValid = apiKey === env.INTERNAL_API_KEY;
  if (!isValid) {
    const origin = headers.get("origin");
    const referer = headers.get("referer");
    const userAgent = headers.get("user-agent");

    logger.error("Invalid API key", {
      invalidApiKeyHash: apiKey ? hash(apiKey) : null,
      invalidApiKeyLength: apiKey?.length,
      origin,
      referer,
      userAgent,
      callerId: headers.get(INTERNAL_CALLER_ID_HEADER),
      callerApp: headers.get(INTERNAL_CALLER_APP_HEADER),
      callerRuntime: headers.get(INTERNAL_CALLER_RUNTIME_HEADER),
      callerBaseUrlHost: headers.get(INTERNAL_CALLER_BASE_URL_HOST_HEADER),
      callerRepo: headers.get(INTERNAL_CALLER_REPO_HEADER),
      callerDeploymentUrl: headers.get(INTERNAL_CALLER_DEPLOYMENT_URL_HEADER),
      callerGitCommit: headers.get(INTERNAL_CALLER_GIT_COMMIT_HEADER),
    });
  }
  return isValid;
};

function getInternalCallerMetadata() {
  const baseUrlHost = getHost(env.NEXT_PUBLIC_BASE_URL);

  return {
    id: baseUrlHost || "inbox-zero-web",
    app: "inbox-zero-web",
    runtime: process.env.VERCEL === "1" ? "vercel" : "self-hosted",
    baseUrlHost,
    repo: getVercelRepo(),
    deploymentUrl: process.env.VERCEL_URL,
    gitCommit: process.env.VERCEL_GIT_COMMIT_SHA,
  };
}

function getVercelRepo() {
  const owner = process.env.VERCEL_GIT_REPO_OWNER;
  const slug = process.env.VERCEL_GIT_REPO_SLUG;

  if (!owner || !slug) return;

  const provider = process.env.VERCEL_GIT_PROVIDER;
  return provider ? `${provider}:${owner}/${slug}` : `${owner}/${slug}`;
}

function getHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return new URL(`https://${url}`).host;
  }
}
