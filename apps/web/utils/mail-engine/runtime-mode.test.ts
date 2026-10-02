import { describe, expect, it } from "vitest";
import {
  selectMailEngineRuntimeMode,
  shouldStartMailEngine,
} from "./runtime-mode";

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

describe("shouldStartMailEngine", () => {
  it.each([
    "/account/assistant",
    "/account/automation",
    "/account/settings",
    "/account/debug/rules",
    "/accounts",
    null,
  ])("does not start browser sync on %s", (pathname) => {
    expect(shouldStartMailEngine({ pathname, desktopIpc: false })).toBe(false);
  });

  it.each([
    "/account/mail",
    "/account/mail/",
    "/account/compose",
    "/account/debug/mail-queue",
  ])("starts browser sync for mail consumers on %s", (pathname) => {
    expect(shouldStartMailEngine({ pathname, desktopIpc: false })).toBe(true);
  });

  it("preserves desktop background sync outside Mail", () => {
    expect(
      shouldStartMailEngine({
        pathname: "/account/assistant",
        desktopIpc: true,
      }),
    ).toBe(true);
  });

  it("keeps browser work running after a mail consumer has requested it", () => {
    expect(
      shouldStartMailEngine({
        pathname: "/account/assistant",
        desktopIpc: false,
        browserRequested: true,
      }),
    ).toBe(true);
  });

  it("only matches account-level mail routes", () => {
    expect(
      shouldStartMailEngine({
        pathname: "/organization/mail/settings",
        desktopIpc: false,
      }),
    ).toBe(false);
    expect(
      shouldStartMailEngine({
        pathname: "/account/settings/mail",
        desktopIpc: false,
      }),
    ).toBe(false);
  });
});
