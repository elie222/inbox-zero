import { describe, expect, it } from "vitest";
import {
  detectDesktopClientPlatform,
  getDesktopDownloadCtas,
  pickLatestDesktopRelease,
  type DesktopDownloadLinks,
  type GitHubRelease,
} from "./github-release";

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

const DOWNLOADS: DesktopDownloadLinks = {
  version: "0.2.0",
  releaseUrl:
    "https://github.com/elie222/inbox-zero/releases/tag/desktop-v0.2.0",
  macArm64Dmg:
    "https://github.com/elie222/inbox-zero/releases/download/desktop-v0.2.0/Inbox-Zero-0.2.0-mac-arm64.dmg",
  macX64Dmg:
    "https://github.com/elie222/inbox-zero/releases/download/desktop-v0.2.0/Inbox-Zero-0.2.0-mac-x64.dmg",
  winX64Exe:
    "https://github.com/elie222/inbox-zero/releases/download/desktop-v0.2.0/Inbox-Zero-0.2.0-win-x64.exe",
  winArm64Exe:
    "https://github.com/elie222/inbox-zero/releases/download/desktop-v0.2.0/Inbox-Zero-0.2.0-win-arm64.exe",
};

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
      release("desktop-v0.2.0", [
        "Inbox-Zero-0.2.0-mac-arm64.dmg",
        "Inbox-Zero-0.2.0-mac-x64.dmg",
        "Inbox-Zero-0.2.0-win-x64.exe",
        "Inbox-Zero-0.2.0-win-arm64.exe",
      ]),
    ]);

    expect(links).toEqual(DOWNLOADS);
  });

  it("picks a newer desktop tag even when GitHub lists an older one first", () => {
    const links = pickLatestDesktopRelease([
      release("desktop-v0.9.0", ["Inbox-Zero-0.9.0-mac-x64.dmg"]),
      release("desktop-v0.10.0", ["Inbox-Zero-0.10.0-mac-arm64.dmg"]),
    ]);

    expect(links?.version).toBe("0.10.0");
    expect(links?.macArm64Dmg).toContain("0.10.0-mac-arm64.dmg");
  });

  it("skips CLI and feed-only releases", () => {
    expect(
      pickLatestDesktopRelease([
        release("v2.30.0", ["inbox-zero-cli.tgz"]),
        release("desktop-updates", ["latest-mac.yml"], true),
      ]),
    ).toBeNull();
  });

  it("skips semver prerelease desktop tags", () => {
    const links = pickLatestDesktopRelease([
      release("desktop-v1.0.0-beta.1", [
        "Inbox-Zero-1.0.0-beta.1-mac-arm64.dmg",
      ]),
      release("desktop-v0.2.0", ["Inbox-Zero-0.2.0-mac-arm64.dmg"]),
    ]);

    expect(links?.version).toBe("0.2.0");
  });
});

describe("detectDesktopClientPlatform", () => {
  it("does not treat Safari's Intel Mac OS X token as an Intel Mac", () => {
    expect(
      detectDesktopClientPlatform(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
      ),
    ).toEqual({ os: "mac", arch: "unknown" });
  });

  it("uses Client Hints architecture when present", () => {
    expect(
      detectDesktopClientPlatform(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        { platform: "macOS", architecture: "arm" },
      ),
    ).toEqual({ os: "mac", arch: "arm" });
    expect(
      detectDesktopClientPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)", {
        platform: "Windows",
        architecture: "x86",
      }),
    ).toEqual({ os: "windows", arch: "x64" });
  });
});

describe("getDesktopDownloadCtas", () => {
  it("labels Apple Silicon for Macs when the architecture is unknown", () => {
    const { primary, alternatives } = getDesktopDownloadCtas(DOWNLOADS, {
      os: "mac",
      arch: "unknown",
    });

    expect(primary?.shortLabel).toBe("Mac (Apple Silicon)");
    expect(primary?.href).toBe(DOWNLOADS.macArm64Dmg);
    expect(alternatives.map((item) => item.shortLabel)).toEqual([
      "Mac Intel",
      "Windows",
      "Windows ARM",
    ]);
  });

  it("sends Intel Macs the x64 DMG", () => {
    const { primary } = getDesktopDownloadCtas(DOWNLOADS, {
      os: "mac",
      arch: "x64",
    });

    expect(primary?.shortLabel).toBe("Mac Intel");
    expect(primary?.href).toBe(DOWNLOADS.macX64Dmg);
  });

  it("sends Windows clients the x64 installer unless ARM is detected", () => {
    expect(
      getDesktopDownloadCtas(DOWNLOADS, { os: "windows", arch: "unknown" })
        .primary?.href,
    ).toBe(DOWNLOADS.winX64Exe);
    expect(
      getDesktopDownloadCtas(DOWNLOADS, { os: "windows", arch: "arm" }).primary
        ?.href,
    ).toBe(DOWNLOADS.winArm64Exe);
  });

  it("does not pick a primary installer before the client OS is known", () => {
    const { primary, alternatives } = getDesktopDownloadCtas(DOWNLOADS, {
      os: "other",
      arch: "unknown",
    });

    expect(primary).toBeNull();
    expect(alternatives.map((item) => item.shortLabel)).toEqual([
      "Mac (Apple Silicon)",
      "Mac Intel",
      "Windows",
      "Windows ARM",
    ]);
  });
});
