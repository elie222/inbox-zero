import { describe, expect, it } from "vitest";
import { pickLatestDesktopRelease, type GitHubRelease } from "./github-release";

describe("pickLatestDesktopRelease", () => {
  it("picks the newest non-prerelease desktop tag and its installers", () => {
    const links = pickLatestDesktopRelease([
      release("v2.30.0", ["inbox-zero-cli.tgz"]),
      release("desktop-updates", ["latest-mac.yml"], true),
      release("desktop-v0.1.0", [
        "Inbox-Zero-0.1.0-mac-arm64.dmg",
        "Inbox-Zero-0.1.0-mac-arm64.dmg.blockmap",
        "Inbox-Zero-0.1.0-mac-x64.dmg",
        "Inbox-Zero-0.1.0-win-x64.exe",
        "Inbox-Zero-0.1.0-win-arm64.exe",
      ]),
    ]);

    expect(links).toEqual({
      version: "0.1.0",
      releaseUrl:
        "https://github.com/elie222/inbox-zero/releases/tag/desktop-v0.1.0",
      macArm64Dmg:
        "https://github.com/elie222/inbox-zero/releases/download/desktop-v0.1.0/Inbox-Zero-0.1.0-mac-arm64.dmg",
      macX64Dmg:
        "https://github.com/elie222/inbox-zero/releases/download/desktop-v0.1.0/Inbox-Zero-0.1.0-mac-x64.dmg",
      winX64Exe:
        "https://github.com/elie222/inbox-zero/releases/download/desktop-v0.1.0/Inbox-Zero-0.1.0-win-x64.exe",
      winArm64Exe:
        "https://github.com/elie222/inbox-zero/releases/download/desktop-v0.1.0/Inbox-Zero-0.1.0-win-arm64.exe",
    });
  });

  it("skips CLI and feed-only releases", () => {
    expect(
      pickLatestDesktopRelease([
        release("v2.30.0", ["inbox-zero-cli.tgz"]),
        release("desktop-updates", ["latest-mac.yml"], true),
      ]),
    ).toBeNull();
  });
});

function release(
  tagName: string,
  assets: string[],
  prerelease = false,
): GitHubRelease {
  return {
    tag_name: tagName,
    prerelease,
    html_url: `https://github.com/elie222/inbox-zero/releases/tag/${tagName}`,
    assets: assets.map((name) => ({
      name,
      browser_download_url: `https://github.com/elie222/inbox-zero/releases/download/${tagName}/${name}`,
    })),
  };
}
