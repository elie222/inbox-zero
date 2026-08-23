// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MailboxSyncManager } from "./MailboxSyncManager";

const accounts = vi.hoisted(() => ({ useAccounts: vi.fn() }));
const mailboxSync = vi.hoisted(() => ({ useMailboxSync: vi.fn() }));

vi.mock("@/hooks/useAccounts", () => ({ useAccounts: accounts.useAccounts }));
vi.mock("./use-mailbox-sync", () => ({
  useMailboxSync: mailboxSync.useMailboxSync,
}));

describe("MailboxSyncManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    accounts.useAccounts.mockReturnValue({
      data: {
        emailAccounts: [{ id: "account-1" }, { id: "account-2" }],
      },
    });
  });

  it("keeps every connected account synchronized", () => {
    render(<MailboxSyncManager />);

    expect(mailboxSync.useMailboxSync).toHaveBeenCalledTimes(2);
    expect(mailboxSync.useMailboxSync).toHaveBeenNthCalledWith(1, {
      emailAccountId: "account-1",
      enabled: true,
    });
    expect(mailboxSync.useMailboxSync).toHaveBeenNthCalledWith(2, {
      emailAccountId: "account-2",
      enabled: true,
    });
  });
});
