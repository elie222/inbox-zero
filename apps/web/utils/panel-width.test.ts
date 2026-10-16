import { describe, expect, it } from "vitest";
import {
  clampPanelWidth,
  type PanelWidthConfig,
  parsePanelWidthCookie,
} from "./panel-width";

const config: PanelWidthConfig = {
  cookie: "test-panel-width",
  cssVar: "--test-panel-width",
  defaultWidth: 236,
  minWidth: 180,
  maxWidth: 440,
};

describe("clampPanelWidth", () => {
  it("keeps a width that is already in range", () => {
    expect(clampPanelWidth(config, 300)).toBe(300);
  });

  it("clamps to the bounds", () => {
    expect(clampPanelWidth(config, 10)).toBe(config.minWidth);
    expect(clampPanelWidth(config, 5000)).toBe(config.maxWidth);
  });

  it("rounds to whole pixels", () => {
    expect(clampPanelWidth(config, 240.6)).toBe(241);
  });
});

describe("parsePanelWidthCookie", () => {
  it("reads a saved width", () => {
    expect(parsePanelWidthCookie(config, "320")).toBe(320);
  });

  it("falls back to the default for a missing or malformed cookie", () => {
    expect(parsePanelWidthCookie(config, undefined)).toBe(config.defaultWidth);
    expect(parsePanelWidthCookie(config, "not-a-width")).toBe(
      config.defaultWidth,
    );
  });

  it("clamps a saved width that is out of range", () => {
    expect(parsePanelWidthCookie(config, "9999")).toBe(config.maxWidth);
  });
});
