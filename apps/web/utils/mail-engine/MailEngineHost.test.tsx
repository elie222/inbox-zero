// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MailEngineRuntime } from "./MailEngineHost";

const mocks = vi.hoisted(() => ({
  account: { emailAccountId: "account-1", provider: "" },
  desktopIpc: false,
  createBrowserMailEngine: vi.fn(),
  startDesktopIpcMailClient: vi.fn(),
  close: vi.fn(),
}));

vi.mock("next/navigation", () => ({ usePathname: () => "/account-1/mail" }));
vi.mock("@/providers/EmailAccountProvider", () => ({
  useAccount: () => mocks.account,
}));
vi.mock("@/env", () => ({ env: {} }));
vi.mock("@/utils/mail-engine/create-browser-engine", () => ({
  createBrowserMailEngine: mocks.createBrowserMailEngine,
}));
vi.mock("@/utils/mail-engine/desktop-ipc", () => ({
  hasDesktopMailEngineIpc: () => mocks.desktopIpc,
  startDesktopIpcMailClient: mocks.startDesktopIpcMailClient,
}));
vi.mock("@/utils/mail-engine/worker-protocol", () => ({
  browserMailEngineCapabilities: () => ({
    worker: true,
    locks: true,
    opfs: true,
  }),
}));
vi.mock("@/utils/fetch-email-accounts", () => ({
  fetchEmailAccounts: async () => ({ emailAccounts: [] }),
}));
vi.mock("@/utils/mail-engine/follow-mailbox-changes", () => ({
  followMailboxChanges: () => () => {},
}));

describe("mail engine account lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.account = { emailAccountId: "account-1", provider: "" };
    mocks.desktopIpc = false;
    mocks.close.mockResolvedValue(undefined);
    mocks.createBrowserMailEngine.mockImplementation(async () => ({
      close: mocks.close,
    }));
    mocks.startDesktopIpcMailClient.mockResolvedValue(undefined);
    vi.stubGlobal("BroadcastChannel", undefined);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it.each([
    false,
    true,
  ])("starts exactly once after the provider resolves (desktop: %s)", async (desktop) => {
    mocks.desktopIpc = desktop;
    const start = desktop
      ? mocks.startDesktopIpcMailClient
      : mocks.createBrowserMailEngine;
    const view = render(<MailEngineRuntime>{null}</MailEngineRuntime>);
    await act(async () => {});
    expect(start).not.toHaveBeenCalled();

    mocks.account = { emailAccountId: "account-1", provider: "google" };
    view.rerender(<MailEngineRuntime>{null}</MailEngineRuntime>);
    await waitFor(() => expect(start).toHaveBeenCalledOnce());
    view.rerender(<MailEngineRuntime>{null}</MailEngineRuntime>);
    expect(start).toHaveBeenCalledOnce();
    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: "account-1", provider: "google" }),
    );
    expect(mocks.close).not.toHaveBeenCalled();
  });

  it.each([
    "google",
    "microsoft",
  ])("closes the old browser engine and starts the switched %s account", async (provider) => {
    mocks.account.provider = "google";
    const view = render(<MailEngineRuntime>{null}</MailEngineRuntime>);
    await waitFor(() =>
      expect(mocks.createBrowserMailEngine).toHaveBeenCalledOnce(),
    );

    mocks.account = { emailAccountId: "account-2", provider };
    view.rerender(<MailEngineRuntime>{null}</MailEngineRuntime>);
    await waitFor(() =>
      expect(mocks.createBrowserMailEngine).toHaveBeenCalledTimes(2),
    );
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(mocks.createBrowserMailEngine).toHaveBeenLastCalledWith(
      expect.objectContaining({ accountId: "account-2", provider }),
    );
  });
});
