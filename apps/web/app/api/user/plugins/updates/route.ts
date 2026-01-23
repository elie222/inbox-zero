import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import {
  fetchAllCatalogPlugins,
  fetchPluginVersions,
  fetchPluginManifest,
} from "@/lib/plugin-library/catalog";
import {
  comparePermissions,
  type CapabilityDetail,
} from "@/lib/plugin-runtime/permission-diff";

export type PermissionChanges = {
  added: CapabilityDetail[];
  removed: CapabilityDetail[];
  hasNewPermissions: boolean;
};

export type PluginUpdateInfo = {
  id: string;
  name: string;
  currentVersion: string;
  latestVersion: string;
  repositoryUrl: string;
  changelog?: {
    new?: string[];
    improved?: string[];
    fixed?: string[];
  };
  permissionChanges?: PermissionChanges;
};

export type PluginUpdatesResponse = Awaited<ReturnType<typeof getUpdates>>;

export const GET = withEmailAccount(async () => {
  const result = await getUpdates();
  return NextResponse.json(result);
});

async function getUpdates() {
  const installedPlugins = await prisma.installedPlugin.findMany({
    where: { enabled: true },
    select: {
      id: true,
      pluginId: true,
      version: true,
      repositoryUrl: true,
    },
  });

  const catalogPlugins = await fetchAllCatalogPlugins();

  const updates: PluginUpdateInfo[] = [];

  for (const installed of installedPlugins) {
    const catalogPlugin = catalogPlugins.find(
      (p) => p.id === installed.pluginId,
    );

    if (!catalogPlugin) continue;

    if (catalogPlugin.version !== installed.version) {
      let changelog: PluginUpdateInfo["changelog"];
      let permissionChanges: PermissionChanges | undefined;

      if (installed.repositoryUrl) {
        try {
          const versions = await fetchPluginVersions(installed.repositoryUrl);
          const latestRelease = versions.find(
            (v) => v.type === "release" && !v.prerelease,
          );

          if (latestRelease?.releaseNotes) {
            changelog = parseChangelog(latestRelease.releaseNotes);
          }
        } catch {
          // ignore changelog fetch errors
        }

        // fetch manifests to compare permissions
        try {
          const [currentManifest, latestManifest] = await Promise.all([
            fetchPluginManifest(installed.repositoryUrl, installed.version),
            fetchPluginManifest(installed.repositoryUrl),
          ]);

          if (currentManifest && latestManifest) {
            const diff = comparePermissions(currentManifest, latestManifest);
            if (diff.hasChanges) {
              permissionChanges = {
                added: diff.added,
                removed: diff.removed,
                hasNewPermissions: diff.added.length > 0,
              };
            }
          }
        } catch {
          // ignore permission diff errors - update can still proceed
        }
      }

      updates.push({
        id: installed.pluginId,
        name: catalogPlugin.name,
        currentVersion: installed.version,
        latestVersion: catalogPlugin.version,
        repositoryUrl: catalogPlugin.repositoryUrl,
        changelog,
        permissionChanges,
      });
    }
  }

  return { updates };
}

function parseChangelog(releaseNotes: string): PluginUpdateInfo["changelog"] {
  const changelog: {
    new?: string[];
    improved?: string[];
    fixed?: string[];
  } = {};

  const lines = releaseNotes
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  let currentSection: "new" | "improved" | "fixed" | null = null;

  for (const line of lines) {
    const lowerLine = line.toLowerCase();

    if (lowerLine.startsWith("## new") || lowerLine.startsWith("### new")) {
      currentSection = "new";
      changelog.new = [];
      continue;
    }

    if (
      lowerLine.startsWith("## improved") ||
      lowerLine.startsWith("### improved") ||
      lowerLine.startsWith("## enhancements") ||
      lowerLine.startsWith("### enhancements")
    ) {
      currentSection = "improved";
      changelog.improved = [];
      continue;
    }

    if (
      lowerLine.startsWith("## fixed") ||
      lowerLine.startsWith("### fixed") ||
      lowerLine.startsWith("## bug fixes") ||
      lowerLine.startsWith("### bug fixes")
    ) {
      currentSection = "fixed";
      changelog.fixed = [];
      continue;
    }

    if (
      currentSection &&
      (line.startsWith("-") || line.startsWith("*") || line.startsWith("•"))
    ) {
      const text = line.replace(/^[-*•]\s*/, "").trim();
      if (text) {
        changelog[currentSection]?.push(text);
      }
    }
  }

  return changelog;
}
