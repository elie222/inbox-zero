export const DESKTOP_GITHUB_REPO = "elie222/inbox-zero";
export const DESKTOP_TAG_PREFIX = "desktop-v";

export type GitHubReleaseAsset = {
  browser_download_url: string;
  name: string;
};

export type GitHubRelease = {
  assets: GitHubReleaseAsset[];
  html_url: string;
  prerelease: boolean;
  tag_name: string;
};

export type DesktopDownloadLinks = {
  macArm64Dmg: string | null;
  macX64Dmg: string | null;
  releaseUrl: string;
  version: string;
  winArm64Exe: string | null;
  winX64Exe: string | null;
};

export type DesktopClientPlatform = {
  arch: "arm" | "x64" | "unknown";
  os: "mac" | "windows" | "other";
};

export type DesktopDownloadCta = {
  href: string;
  kind: "mac" | "windows";
  label: string;
  shortLabel: string;
};

export function compareDesktopVersions(a: string, b: string): number {
  const left = a.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const right = b.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index++) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    if (delta > 0) return 1;
    if (delta < 0) return -1;
  }
  return 0;
}

export function pickLatestDesktopRelease(
  releases: readonly GitHubRelease[],
): DesktopDownloadLinks | null {
  const desktopReleases = releases.filter(
    (item) => !item.prerelease && item.tag_name.startsWith(DESKTOP_TAG_PREFIX),
  );
  if (desktopReleases.length === 0) return null;

  const release = desktopReleases.reduce((newest, item) =>
    compareDesktopVersions(
      versionFromDesktopTag(item.tag_name),
      versionFromDesktopTag(newest.tag_name),
    ) > 0
      ? item
      : newest,
  );

  return {
    version: versionFromDesktopTag(release.tag_name),
    releaseUrl: release.html_url,
    macArm64Dmg: findAssetUrl(release.assets, "-mac-arm64.dmg"),
    macX64Dmg: findAssetUrl(release.assets, "-mac-x64.dmg"),
    winX64Exe: findAssetUrl(release.assets, "-win-x64.exe"),
    winArm64Exe: findAssetUrl(release.assets, "-win-arm64.exe"),
  };
}

export function detectDesktopClientPlatform(
  userAgent: string,
  userAgentData?: {
    architecture?: string;
    platform?: string;
  } | null,
): DesktopClientPlatform {
  const ua = userAgent.toLowerCase();
  const platformHint = userAgentData?.platform?.toLowerCase() ?? "";
  const architectureHint = userAgentData?.architecture?.toLowerCase() ?? "";

  const os: DesktopClientPlatform["os"] =
    platformHint.includes("win") || ua.includes("windows")
      ? "windows"
      : platformHint.includes("mac") ||
          ua.includes("mac os") ||
          ua.includes("macintosh")
        ? "mac"
        : "other";

  let arch: DesktopClientPlatform["arch"] = "unknown";
  if (
    architectureHint.includes("arm") ||
    ua.includes("aarch64") ||
    ua.includes("arm64")
  ) {
    arch = "arm";
  } else if (
    architectureHint.includes("x86") ||
    architectureHint.includes("x64") ||
    ua.includes("x86_64") ||
    ua.includes("wow64") ||
    ua.includes("win64")
  ) {
    arch = "x64";
  }

  return { arch, os };
}

export function getDesktopDownloadCtas(
  downloads: DesktopDownloadLinks,
  platform: DesktopClientPlatform,
): {
  alternatives: DesktopDownloadCta[];
  primary: DesktopDownloadCta | null;
} {
  const versionSuffix = downloads.version ? ` ${downloads.version}` : "";
  const options: Array<DesktopDownloadCta & { match: boolean }> = [];

  if (downloads.macArm64Dmg) {
    options.push({
      href: downloads.macArm64Dmg,
      kind: "mac",
      label: `Download for Mac (Apple Silicon)${versionSuffix}`,
      match: platform.os === "mac" && platform.arch !== "x64",
      shortLabel: "Mac (Apple Silicon)",
    });
  }
  if (downloads.macX64Dmg) {
    options.push({
      href: downloads.macX64Dmg,
      kind: "mac",
      label: `Download for Mac Intel${versionSuffix}`,
      match: platform.os === "mac" && platform.arch === "x64",
      shortLabel: "Mac Intel",
    });
  }
  if (downloads.winX64Exe) {
    options.push({
      href: downloads.winX64Exe,
      kind: "windows",
      label: `Download for Windows${versionSuffix}`,
      match: platform.os === "windows" && platform.arch !== "arm",
      shortLabel: "Windows",
    });
  }
  if (downloads.winArm64Exe) {
    options.push({
      href: downloads.winArm64Exe,
      kind: "windows",
      label: `Download for Windows (ARM)${versionSuffix}`,
      match: platform.os === "windows" && platform.arch === "arm",
      shortLabel: "Windows ARM",
    });
  }

  const matched = options.find((option) => option.match);
  const osFallback = options.find((option) => option.kind === platform.os);
  const primary = matched ?? osFallback ?? null;
  const alternatives = options
    .filter((option) => option.href !== primary?.href)
    .map(({ href, kind, label, shortLabel }) => ({
      href,
      kind,
      label,
      shortLabel,
    }));

  return { alternatives, primary };
}

function versionFromDesktopTag(tag: string): string {
  return tag.startsWith(DESKTOP_TAG_PREFIX)
    ? tag.slice(DESKTOP_TAG_PREFIX.length)
    : tag;
}

function findAssetUrl(
  assets: readonly GitHubReleaseAsset[],
  suffix: string,
): string | null {
  return (
    assets.find(
      (asset) =>
        asset.name.endsWith(suffix) && !asset.name.endsWith(".blockmap"),
    )?.browser_download_url ?? null
  );
}
