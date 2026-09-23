import { describe, expect, it } from "vitest";
import { parseDesktopAppVersion } from "@/utils/analytics/client";

describe("parseDesktopAppVersion", () => {
  it("reads the version from the Electron user agent", () => {
    expect(
      parseDesktopAppVersion(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) InboxZero/0.4.2 Chrome/140.0.0.0 Electron/43.4.0 Safari/537.36",
      ),
    ).toBe("0.4.2");
  });

  it("tolerates the product name keeping its space or changing case", () => {
    expect(
      parseDesktopAppVersion("Mozilla/5.0 Inbox Zero/1.0.0-beta.1 Chrome/140"),
    ).toBe("1.0.0-beta.1");
    expect(parseDesktopAppVersion("Mozilla/5.0 inboxzero/2.3.4")).toBe("2.3.4");
  });

  it("returns undefined for browser user agents", () => {
    expect(
      parseDesktopAppVersion(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
      ),
    ).toBeUndefined();
    expect(
      parseDesktopAppVersion("Mozilla/5.0 NotInboxZero/1.0.0"),
    ).toBeUndefined();
  });
});
