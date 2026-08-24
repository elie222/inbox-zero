// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MailboxSyncManager } from "./MailboxSyncManager";

const accounts = vi.hoisted(() => ({ useAccounts: vi.fn() }));
const activeAccount = vi.hoisted(() => ({ emailAccountId: "account-2" }));
const mailboxSync = vi.hoisted(() => ({ useMailboxSync: vi.fn() }));

vi.mock("@/hooks/useAccounts", () => ({ useAccounts: accounts.useAccounts }));
vi.mock("@/providers/EmailAccountProvider", () => ({
  useAccount: () => activeAccount,
}));
vi.mock("@/app/(app)/[emailAccountId]/mail/use-mailbox-sync", () => ({
  useMailboxSync: mailboxSync.useMailboxSync,
}));

describe("MailboxSyncManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("starts warming every connected account and prioritizes the active one", () => {
    render(<MailboxSyncManager />);

    expect(mailboxSync.useMailboxSync).toHaveBeenCalledTimes(2);
    expect(mailboxSync.useMailboxSync).toHaveBeenNthCalledWith(1, {
      emailAccountId: "account-2",
      enabled: true,
      priority: true,
    });
    expect(mailboxSync.useMailboxSync).toHaveBeenNthCalledWith(2, {
      emailAccountId: "account-1",
      enabled: true,
      priority: false,
    });
  });
});
