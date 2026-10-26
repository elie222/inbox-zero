import { describe, it, expect } from "vitest";
import { getDriveFileUrl } from "./url";

describe("getDriveFileUrl", () => {
  it("should return Google Drive URL for google provider", () => {
    expect(getDriveFileUrl("file123", "google")).toBe(
      "https://drive.google.com/file/d/file123/view",
    );
  });

  it("should return OneDrive URL for microsoft provider", () => {
    expect(getDriveFileUrl("file456", "microsoft")).toBe(
      "https://onedrive.live.com/?id=file456",
    );
  });

  it("should return the provider name for unknown provider", () => {
    // @ts-expect-error - testing invalid provider at runtime
    expect(getDriveFileUrl("file789", "unknown")).toBe("unknown");
  });
});
