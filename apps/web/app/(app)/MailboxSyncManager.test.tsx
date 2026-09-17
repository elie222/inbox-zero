// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  activateMailSync,
  clearMailActivation,
} from "@/utils/email-cache/mail-activation";
import { MailboxSyncManager } from "./MailboxSyncManager";

const accounts = vi.hoisted(() => ({ useAccounts: vi.fn() }));
const activeAccount = vi.hoisted(() => ({ emailAccountId: "account-2" }));
const mailboxSync = vi.hoisted(() => ({ useLocalMailSync: vi.fn() }));

vi.mock("@/hooks/useAccounts", () => ({ useAccounts: accounts.useAccounts }));
vi.mock("@/providers/EmailAccountProvider", () => ({
  useAccount: () => activeAccount,
}));
vi.mock("@/hooks/useLocalMailSync", () => ({
  useLocalMailSync: mailboxSync.useLocalMailSync,
}));

describe("MailboxSyncManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    accounts.useAccounts.mockReturnValue({
      data: {
        emailAccounts: [
          { account: { disconnectedAt: null }, id: "account-1" },
          { account: { disconnectedAt: null }, id: "account-2" },
          {
            account: { disconnectedAt: "2026-08-23T10:00:00.000Z" },
            id: "disconnected-account",
          },
        ],
      },
    });
  });

  afterEach(cleanup);

  it("does not enable background downloads for assistant-only users", () => {
    render(<MailboxSyncManager />);

    expect(mailboxSync.useLocalMailSync).toHaveBeenCalledTimes(2);
    for (const [options] of mailboxSync.useLocalMailSync.mock.calls) {
      expect(options.enabled).toBe(false);
    }
  });

  it("resumes activated accounts and prioritizes the active one", () => {
    activateMailSync("account-1");
    activateMailSync("account-2");
    activateMailSync("disconnected-account");
    render(<MailboxSyncManager />);

    expect(mailboxSync.useLocalMailSync).toHaveBeenCalledTimes(2);
    expect(mailboxSync.useLocalMailSync).toHaveBeenNthCalledWith(1, {
      emailAccountId: "account-2",
      enabled: true,
      priority: true,
    });
    expect(mailboxSync.useLocalMailSync).toHaveBeenNthCalledWith(2, {
      emailAccountId: "account-1",
      enabled: true,
      priority: false,
    });
  });

  it("starts only a newly activated account and stops after local cleanup", () => {
    render(<MailboxSyncManager />);
    mailboxSync.useLocalMailSync.mockClear();

    act(() => activateMailSync("account-1"));
    expect(mailboxSync.useLocalMailSync).toHaveBeenLastCalledWith({
      emailAccountId: "account-1",
      enabled: true,
      priority: false,
    });
    expect(mailboxSync.useLocalMailSync).not.toHaveBeenCalledWith(
      expect.objectContaining({ emailAccountId: "account-2", enabled: true }),
    );

    act(() => clearMailActivation("account-1"));
    expect(mailboxSync.useLocalMailSync).toHaveBeenLastCalledWith({
      emailAccountId: "account-1",
      enabled: false,
      priority: false,
    });
  });

  it("does not reuse activation for a different signed-in account", () => {
    activateMailSync("previous-account");
    render(<MailboxSyncManager />);
    for (const [options] of mailboxSync.useLocalMailSync.mock.calls) {
      expect(options.enabled).toBe(false);
    }
  });
});
