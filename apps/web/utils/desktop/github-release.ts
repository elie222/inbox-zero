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
  const release = releases.find(
    (item) => !item.prerelease && item.tag_name.startsWith(DESKTOP_TAG_PREFIX),
  );
  if (!release) return null;

  return {
    version: release.tag_name.slice(DESKTOP_TAG_PREFIX.length),
    releaseUrl: release.html_url,
    macArm64Dmg: findAssetUrl(release.assets, "-mac-arm64.dmg"),
    macX64Dmg: findAssetUrl(release.assets, "-mac-x64.dmg"),
    winX64Exe: findAssetUrl(release.assets, "-win-x64.exe"),
    winArm64Exe: findAssetUrl(release.assets, "-win-arm64.exe"),
  };
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
