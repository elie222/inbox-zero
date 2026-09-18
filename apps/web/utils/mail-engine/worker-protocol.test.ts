import { describe, expect, it } from "vitest";
import { browserMailEngineCapabilities } from "./worker-protocol";

describe("browser mail engine capabilities", () => {
  it("reports worker and OPFS support from the current runtime", () => {
    const capabilities = browserMailEngineCapabilities();
    expect(capabilities).toEqual({
      worker: typeof Worker !== "undefined",
      locks:
        typeof navigator !== "undefined" &&
        Boolean((navigator as Navigator & { locks?: unknown }).locks),
      opfs:
        typeof navigator !== "undefined" &&
        "storage" in navigator &&
        "getDirectory" in navigator.storage,
    });
  });
});
