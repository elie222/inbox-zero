import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getDesktopAssetBaseUrl,
  getDesktopUpdateFeedUrl,
  rewriteUpdateFeedFiles,
  rewriteUpdateFeedYaml,
} from "./update-feed";

const MAC_YML = `version: 0.1.0
files:
  - url: Inbox-Zero-0.1.0-mac-arm64.zip
    sha512: abc
    size: 12
  - url: 'Inbox-Zero-0.1.0-mac-x64.zip'
    sha512: def
    size: 13
path: Inbox-Zero-0.1.0-mac-arm64.zip
sha512: abc
releaseDate: '2026-08-16T10:00:00.000Z'
`;

describe("desktop update feed", () => {
  it("points the generic feed at a stable GitHub release tag", () => {
    expect(getDesktopUpdateFeedUrl()).toBe(
      "https://github.com/elie222/inbox-zero/releases/download/desktop-updates",
    );
    expect(getDesktopAssetBaseUrl("desktop-v0.1.0")).toBe(
      "https://github.com/elie222/inbox-zero/releases/download/desktop-v0.1.0",
    );
  });

  it("rewrites relative artifact names to the versioned GitHub release", () => {
    const yaml = rewriteUpdateFeedYaml(
      MAC_YML,
      "https://github.com/elie222/inbox-zero/releases/download/desktop-v0.1.0/",
    );
    expect(yaml).toContain(
      "url: https://github.com/elie222/inbox-zero/releases/download/desktop-v0.1.0/Inbox-Zero-0.1.0-mac-arm64.zip",
    );
    expect(yaml).toContain(
      "url: 'https://github.com/elie222/inbox-zero/releases/download/desktop-v0.1.0/Inbox-Zero-0.1.0-mac-x64.zip'",
    );
    expect(yaml).toContain(
      "path: https://github.com/elie222/inbox-zero/releases/download/desktop-v0.1.0/Inbox-Zero-0.1.0-mac-arm64.zip",
    );
    expect(yaml).toContain("sha512: abc");
    expect(yaml).toContain("version: 0.1.0");
  });

  it("leaves absolute URLs and checksums alone", () => {
    const yaml = rewriteUpdateFeedYaml(
      `url: https://example.com/Inbox-Zero-0.1.0-mac-arm64.zip
path: https://example.com/Inbox-Zero-0.1.0-mac-arm64.zip
sha512: abc
`,
      "https://github.com/elie222/inbox-zero/releases/download/desktop-v0.1.0",
    );
    expect(yaml).toContain(
      "url: https://example.com/Inbox-Zero-0.1.0-mac-arm64.zip",
    );
    expect(yaml).toContain("sha512: abc");
  });
});

describe("rewriteUpdateFeedFiles", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    dirs.length = 0;
  });

  it("rewrites generated electron-builder yml files in place", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-feed-"));
    dirs.push(dir);
    fs.writeFileSync(path.join(dir, "latest-mac.yml"), MAC_YML);
    fs.writeFileSync(path.join(dir, "notes.txt"), "leave me");

    expect(
      rewriteUpdateFeedFiles(
        dir,
        "https://github.com/elie222/inbox-zero/releases/download/desktop-v0.1.0",
      ),
    ).toEqual(["latest-mac.yml"]);
    expect(fs.readFileSync(path.join(dir, "latest-mac.yml"), "utf8")).toContain(
      "https://github.com/elie222/inbox-zero/releases/download/desktop-v0.1.0/Inbox-Zero-0.1.0-mac-arm64.zip",
    );
    expect(fs.readFileSync(path.join(dir, "notes.txt"), "utf8")).toBe(
      "leave me",
    );
  });
});
