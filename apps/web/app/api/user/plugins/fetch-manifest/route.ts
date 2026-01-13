import { type NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import {
  fetchPluginManifest,
  isValidGitHubUrl,
} from "@/lib/plugin-library/catalog";
import { getTrustLevel } from "@/lib/plugin-runtime/trust";
import type { PluginManifest } from "@inbox-zero/plugin-sdk";

// type guard for octokit errors with status property
function isOctokitError(error: unknown): error is { status: number } {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as { status: unknown }).status === "number"
  );
}

export type FetchManifestResponse = Awaited<ReturnType<typeof fetchManifest>>;

export const GET = withAuth(async (request: NextRequest) => {
  const searchParams = request.nextUrl.searchParams;
  const repositoryUrl = searchParams.get("url");
  const token = searchParams.get("token"); // Optional token for private repos

  if (!repositoryUrl) {
    return NextResponse.json(
      { error: "Repository URL is required" },
      { status: 400 },
    );
  }

  const result = await fetchManifest({
    repositoryUrl,
    token: token ?? undefined,
  });

  if ("error" in result) {
    const status = result.requiresAuth ? 401 : 400;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json(result);
});

async function fetchManifest({
  repositoryUrl,
  token,
}: {
  repositoryUrl: string;
  token?: string;
}) {
  let normalizedUrl = repositoryUrl.trim();

  if (
    !normalizedUrl.startsWith("https://") &&
    !normalizedUrl.startsWith("http://")
  ) {
    normalizedUrl = `https://${normalizedUrl}`;
  }

  if (normalizedUrl.startsWith("http://")) {
    normalizedUrl = normalizedUrl.replace("http://", "https://");
  }

  if (normalizedUrl.endsWith("/")) {
    normalizedUrl = normalizedUrl.slice(0, -1);
  }

  if (normalizedUrl.endsWith(".git")) {
    normalizedUrl = normalizedUrl.slice(0, -4);
  }

  if (!isValidGitHubUrl(normalizedUrl)) {
    return {
      error: "Only https://github.com URLs are allowed",
    };
  }

  let manifest: PluginManifest;
  try {
    manifest = await fetchPluginManifest(normalizedUrl, undefined, token);
  } catch (error) {
    // detect private repo errors (401, 403, 404)
    if (isOctokitError(error)) {
      const status = error.status;
      if (status === 401 || status === 403 || status === 404) {
        // 404 can also mean private repo (GitHub returns 404 for unauthorized access)
        return {
          error:
            "This repository requires authentication. Please provide a GitHub token.",
          requiresAuth: true,
          statusCode: status,
        };
      }
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      error: `Could not fetch plugin.json from repository: ${message}`,
    };
  }

  const trustLevel = getTrustLevel(manifest.id);

  return {
    manifest,
    repositoryUrl: normalizedUrl,
    trustLevel,
    isPrivate: !!token, // flag if token was used
  };
}
