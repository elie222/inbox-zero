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

export function pickLatestDesktopRelease(
  releases: readonly GitHubRelease[],
): DesktopDownloadLinks | null {
  const desktopReleases = releases.filter(
    (item) => !item.prerelease && isStableDesktopTag(item.tag_name),
  );
  if (desktopReleases.length === 0) return null;

  const release = desktopReleases.reduce((newest, item) =>
    compareVersions(
      item.tag_name.slice(DESKTOP_TAG_PREFIX.length),
      newest.tag_name.slice(DESKTOP_TAG_PREFIX.length),
    ) > 0
      ? item
      : newest,
  );

  return {
    version: release.tag_name.slice(DESKTOP_TAG_PREFIX.length),
    releaseUrl: release.html_url,
    macArm64Dmg: findAssetUrl(release.assets, "-mac-arm64.dmg"),
    macX64Dmg: findAssetUrl(release.assets, "-mac-x64.dmg"),
    winX64Exe: findAssetUrl(release.assets, "-win-x64.exe"),
    winArm64Exe: findAssetUrl(release.assets, "-win-arm64.exe"),
  };
}

function compareVersions(a: string, b: string): number {
  const left = a.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const right = b.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index++) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    if (delta !== 0) return delta;
  }

  return 0;
}

function isStableDesktopTag(tag: string): boolean {
  if (!tag.startsWith(DESKTOP_TAG_PREFIX)) return false;

  const version = tag.slice(DESKTOP_TAG_PREFIX.length);
  return /^\d+\.\d+\.\d+$/.test(version);
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
