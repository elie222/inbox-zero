import { describe, expect, it, vi } from "vitest";
vi.mock("@/utils/error", () => ({
  SafeError: class SafeError extends Error {},
}));
import { assertSafeICloudMove } from "./client";

describe("safe iCloud moves", () => {
  it("refuses COPY/EXPUNGE fallback when unrelated deleted mail could be expunged", () => {
    expect(() => assertSafeICloudMove({ capabilities: new Map() })).toThrow();
  });
  it("allows native MOVE and UID-scoped expunge fallback", () => {
    expect(() =>
      assertSafeICloudMove({ capabilities: new Map([["MOVE", true]]) }),
    ).not.toThrow();
    expect(() =>
      assertSafeICloudMove({ capabilities: new Map([["UIDPLUS", true]]) }),
    ).not.toThrow();
  });
});
