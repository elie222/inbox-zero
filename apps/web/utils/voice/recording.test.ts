import { describe, expect, it } from "vitest";
import { pickRecorderMimeType } from "./recording";

describe("pickRecorderMimeType", () => {
  it("prefers opus webm when the browser supports it", () => {
    expect(
      pickRecorderMimeType(
        (type) => type === "audio/webm;codecs=opus" || type === "audio/webm",
      ),
    ).toBe("audio/webm;codecs=opus");
  });

  it("falls back to mp4 for Safari-like support", () => {
    expect(pickRecorderMimeType((type) => type === "audio/mp4")).toBe(
      "audio/mp4",
    );
  });

  it("returns empty when nothing is supported", () => {
    expect(pickRecorderMimeType(() => false)).toBe("");
  });
});
