import { beforeEach, describe, expect, it, vi } from "vitest";
import { getInboxZeroDesktopApp } from "@/utils/desktop-app";
import { startDesktopIpcMailClient } from "./desktop-ipc";

vi.mock("@/utils/desktop-app", () => ({ getInboxZeroDesktopApp: vi.fn() }));

const invoke = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getInboxZeroDesktopApp).mockReturnValue({
    startAuth: vi.fn(),
    mailEngine: invoke,
    mailEngineSubscribe: vi.fn(),
    mailEngineUnsubscribe: vi.fn(),
    onMailEngineSnapshot: vi.fn(),
  });
});

describe("desktop IPC startup", () => {
  it("publishes the client before requesting sync, without waiting for sync", async () => {
    invoke.mockImplementation(() => new Promise(() => {}));
    const publish = vi.fn(async () => {
      expect(invoke).not.toHaveBeenCalled();
    });
    const startup = startDesktopIpcMailClient({
      provider: "google",
      accountId: "test-account",
      publish,
      onSyncError: vi.fn(),
    });
    expect(publish).toHaveBeenCalledOnce();
    await startup;
    expect(invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "requestSync",
        payload: { accountIds: ["test-account"], provider: "google" },
      }),
    );
  });

  it("reports rejected sync without failing startup or withdrawing the client", async () => {
    const error = new Error("IPC disconnected");
    invoke.mockRejectedValue(error);
    const publish = vi.fn().mockResolvedValue(undefined);
    const onSyncError = vi.fn();
    await expect(
      startDesktopIpcMailClient({
        provider: "microsoft",
        accountId: "test-account",
        publish,
        onSyncError,
      }),
    ).resolves.toBeUndefined();
    expect(publish).toHaveBeenCalledOnce();
    expect(onSyncError).toHaveBeenCalledExactlyOnceWith(error);
  });

  it("fails startup when client creation fails", async () => {
    vi.mocked(getInboxZeroDesktopApp).mockReturnValue(undefined);
    const publish = vi.fn();
    const onSyncError = vi.fn();
    await expect(
      startDesktopIpcMailClient({
        provider: "google",
        accountId: "test-account",
        publish,
        onSyncError,
      }),
    ).rejects.toThrow("Desktop mail engine IPC is unavailable");
    expect(publish).not.toHaveBeenCalled();
    expect(onSyncError).not.toHaveBeenCalled();
  });

  it("fails startup when publication fails, without requesting sync", async () => {
    const error = new Error("Publication failed");
    const onSyncError = vi.fn();
    await expect(
      startDesktopIpcMailClient({
        provider: "google",
        accountId: "test-account",
        publish: vi.fn().mockRejectedValue(error),
        onSyncError,
      }),
    ).rejects.toBe(error);
    expect(invoke).not.toHaveBeenCalled();
    expect(onSyncError).not.toHaveBeenCalled();
  });
});
