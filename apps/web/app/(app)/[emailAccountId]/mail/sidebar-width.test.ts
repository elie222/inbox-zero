import { describe, expect, it } from "vitest";
import {
  clampMailSidebarWidth,
  MAIL_SIDEBAR_DEFAULT_WIDTH,
  MAIL_SIDEBAR_MAX_WIDTH,
  MAIL_SIDEBAR_MIN_WIDTH,
} from "./sidebar-width";

describe("clampMailSidebarWidth", () => {
  it("keeps a width that is already in range", () => {
    expect(clampMailSidebarWidth(300)).toBe(300);
  });

  it("clamps to the bounds", () => {
    expect(clampMailSidebarWidth(10)).toBe(MAIL_SIDEBAR_MIN_WIDTH);
    expect(clampMailSidebarWidth(5000)).toBe(MAIL_SIDEBAR_MAX_WIDTH);
  });

  it("falls back to the default for a missing or malformed cookie", () => {
    expect(clampMailSidebarWidth(Number.NaN)).toBe(MAIL_SIDEBAR_DEFAULT_WIDTH);
    expect(clampMailSidebarWidth(Number("not-a-width"))).toBe(
      MAIL_SIDEBAR_DEFAULT_WIDTH,
    );
  });

  it("rounds to whole pixels", () => {
    expect(clampMailSidebarWidth(240.6)).toBe(241);
  });
});
