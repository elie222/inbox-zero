import { describe, expect, it } from "vitest";
import { clampPanelWidth, parsePanelWidthCookie } from "./panel-width";

const bounds = { min: 200, max: 400 };

describe("clampPanelWidth", () => {
  it("keeps a width that is already in range", () => {
    expect(clampPanelWidth(300, bounds)).toBe(300);
  });

  it("clamps to the bounds", () => {
    expect(clampPanelWidth(10, bounds)).toBe(200);
    expect(clampPanelWidth(5000, bounds)).toBe(400);
  });

  it("rounds to whole pixels", () => {
    expect(clampPanelWidth(240.6, bounds)).toBe(241);
  });
});

describe("parsePanelWidthCookie", () => {
  it("reads a saved width", () => {
    expect(parsePanelWidthCookie("320", bounds)).toBe(320);
  });

  it("treats a missing or malformed cookie as no saved width", () => {
    expect(parsePanelWidthCookie(undefined, bounds)).toBeNull();
    expect(parsePanelWidthCookie("", bounds)).toBeNull();
    expect(parsePanelWidthCookie("not-a-width", bounds)).toBeNull();
  });

  it("clamps a saved width from before the bounds changed", () => {
    expect(parsePanelWidthCookie("900", bounds)).toBe(400);
  });
});
