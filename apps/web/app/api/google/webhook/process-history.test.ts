import { describe, it, expect, vi } from "vitest";
import { shouldRunColdEmailBlocker } from "./process-history";
import { ColdEmailSetting } from "@prisma/client";

vi.mock("server-only", () => ({}));

describe("shouldRunColdEmailBlocker", () => {
  it("should return true when coldEmailBlocker is ARCHIVE_AND_READ_AND_LABEL and hasColdEmailAccess is true", () => {
    const result = shouldRunColdEmailBlocker(
      ColdEmailSetting.ARCHIVE_AND_READ_AND_LABEL,
      true,
    );
    expect(result).toBe(true);
  });

  it("should return true when coldEmailBlocker is ARCHIVE_AND_LABEL and hasColdEmailAccess is true", () => {
    const result = shouldRunColdEmailBlocker(
      ColdEmailSetting.ARCHIVE_AND_LABEL,
      true,
    );
    expect(result).toBe(true);
  });

  it("should return true when coldEmailBlocker is LABEL and hasColdEmailAccess is true", () => {
    const result = shouldRunColdEmailBlocker(ColdEmailSetting.LABEL, true);
    expect(result).toBe(true);
  });

  it("should return false when coldEmailBlocker is DISABLED and hasColdEmailAccess is true", () => {
    const result = shouldRunColdEmailBlocker(ColdEmailSetting.DISABLED, true);
    expect(result).toBe(false);
  });

  it("should return false when hasColdEmailAccess is false", () => {
    const result = shouldRunColdEmailBlocker(
      ColdEmailSetting.ARCHIVE_AND_LABEL,
      false,
    );
    expect(result).toBe(false);
  });
});
