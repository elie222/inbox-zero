import { describe, expect, it } from "vitest";
import { selectMailEngineRuntimeMode } from "./runtime-mode";

describe("selectMailEngineRuntimeMode", () => {
  it("prefers desktop IPC over OPFS", () => {
    expect(selectMailEngineRuntimeMode({ desktopIpc: true, opfs: true })).toBe(
      "desktop-ipc",
    );
    expect(selectMailEngineRuntimeMode({ desktopIpc: true, opfs: false })).toBe(
      "desktop-ipc",
    );
  });

  it("uses the browser engine when OPFS is available", () => {
    expect(selectMailEngineRuntimeMode({ desktopIpc: false, opfs: true })).toBe(
      "browser",
    );
  });

  it("is unavailable without desktop IPC or OPFS", () => {
    expect(
      selectMailEngineRuntimeMode({ desktopIpc: false, opfs: false }),
    ).toBe("unavailable");
  });
});
