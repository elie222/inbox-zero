import { afterEach, describe, expect, it, vi } from "vitest";
import { captureException } from "@/utils/error";
import { reportMailEngineStartupFailure } from "./startup-failure";
import { MailEngineStartupError } from "./startup-error";

vi.mock("@/utils/error", () => ({ captureException: vi.fn() }));
vi.mock("@/env", () => ({
  env: new Proxy(
    {},
    {
      get(_target, key) {
        if (typeof key === "string" && key.startsWith("NEXT_PUBLIC_")) return;
        throw new Error("Server-only environment access in browser telemetry");
      },
    },
  ),
}));

afterEach(() => vi.restoreAllMocks());

describe("mail engine startup reporting", () => {
  it.each([
    "browser",
    "desktop-ipc",
  ] as const)("reports %s failures with only startup diagnostics", (runtimeMode) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new MailEngineStartupError(
      "opfs-open",
      new Error("Handle locked"),
    );
    const capabilities = { worker: true, locks: true, opfs: true };
    reportMailEngineStartupFailure(error, {
      runtimeMode,
      platform: runtimeMode === "desktop-ipc" ? "desktop" : "web",
      capabilities,
      stage: "browser-start",
    });
    expect(captureException).toHaveBeenLastCalledWith(error, {
      tags: {
        runtimeMode,
        platform: runtimeMode === "desktop-ipc" ? "desktop" : "web",
        stage: "opfs-open",
      },
      extra: capabilities,
    });
    expect(log).toHaveBeenCalledWith(
      "[mail-engine]:",
      "Mail engine failed to start",
      expect.objectContaining({
        stage: "opfs-open",
        error: { name: "Error", message: "Handle locked" },
      }),
    );
  });
  it("does not forward arbitrary error payloads to telemetry", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const error = Object.assign(new Error("IPC disconnected"), {
      accountId: "private-id",
      email: "private@example.com",
      content: "private content",
    });
    reportMailEngineStartupFailure(error, {
      runtimeMode: "desktop-ipc",
      platform: "desktop",
      capabilities: { worker: false, locks: false, opfs: false },
      stage: "desktop-sync",
    });
    const [reported, context] = vi.mocked(captureException).mock.calls.at(-1)!;
    expect(reported).toMatchObject({
      message: "IPC disconnected",
      stage: "desktop-sync",
    });
    expect(reported).not.toHaveProperty("accountId");
    expect(reported).not.toHaveProperty("email");
    expect(reported).not.toHaveProperty("content");
    expect(JSON.stringify(context)).not.toContain("private");
  });
});
