import { type NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import {
  fetchPluginManifest,
  isValidGitHubUrl,
} from "@/lib/plugin-library/catalog";
import { getTrustLevel } from "@/lib/plugin-runtime/trust";
import type { PluginManifest } from "@inbox-zero/plugin-sdk";

export type FetchManifestResponse = Awaited<ReturnType<typeof fetchManifest>>;

export const GET = withAuth(async (request: NextRequest) => {
  const searchParams = request.nextUrl.searchParams;
  const repositoryUrl = searchParams.get("url");

  if (!repositoryUrl) {
    return NextResponse.json(
      { error: "Repository URL is required" },
      { status: 400 },
    );
  }

  const result = await fetchManifest({ repositoryUrl });

  if ("error" in result) {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json(result);
});

async function fetchManifest({ repositoryUrl }: { repositoryUrl: string }) {
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
    manifest = await fetchPluginManifest(normalizedUrl);
  } catch (error) {
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
  };
}
