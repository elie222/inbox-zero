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

  it("should return empty string for unknown provider", () => {
    expect(getDriveFileUrl("file789", "unknown")).toBe("");
  });

  it("should handle file IDs with special characters", () => {
    const fileId = "1a2b3c-4d5e6f_7g8h9i";
    expect(getDriveFileUrl(fileId, "google")).toBe(
      `https://drive.google.com/file/d/${fileId}/view`,
    );
  });
});
