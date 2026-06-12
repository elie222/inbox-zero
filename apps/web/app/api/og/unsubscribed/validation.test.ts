import { describe, expect, it } from "vitest";
import {
  MAX_UNSUBSCRIBED_COUNT,
  MIN_UNSUBSCRIBED_COUNT,
  parseUnsubscribedCount,
} from "./validation";

describe("parseUnsubscribedCount", () => {
  it("parses a valid integer", () => {
    expect(parseUnsubscribedCount("12")).toBe(12);
  });

  it("rejects a missing param", () => {
    expect(parseUnsubscribedCount(null)).toBeNull();
    expect(parseUnsubscribedCount("")).toBeNull();
  });

  it("rejects non-integer values", () => {
    expect(parseUnsubscribedCount("abc")).toBeNull();
    expect(parseUnsubscribedCount("1.5")).toBeNull();
    expect(parseUnsubscribedCount("-3")).toBeNull();
    expect(parseUnsubscribedCount("1e3")).toBeNull();
    expect(parseUnsubscribedCount("12abc")).toBeNull();
    expect(parseUnsubscribedCount("Infinity")).toBeNull();
  });

  it("rejects unsafe integers", () => {
    expect(parseUnsubscribedCount("99999999999999999999")).toBeNull();
  });

  it("clamps values below the minimum", () => {
    expect(parseUnsubscribedCount("0")).toBe(MIN_UNSUBSCRIBED_COUNT);
  });

  it("clamps values above the maximum", () => {
    expect(parseUnsubscribedCount("123456")).toBe(MAX_UNSUBSCRIBED_COUNT);
  });
});
