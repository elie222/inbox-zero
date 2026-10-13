import type { EffectCallback } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DesktopMailIndicators } from "./DesktopMailIndicators";

const mocks = vi.hoisted(() => ({
  effect: undefined as EffectCallback | undefined,
  account: {
    emailAccountId: "selected",
    emailAccount: { account: { disconnectedAt: null } } as
      | { account: { disconnectedAt: Date | null } }
      | undefined,
  },
  listener: undefined as (() => void) | undefined,
  unread: 4,
  setUnreadCount: vi.fn(),
  close: vi.fn(),
  unsubscribe: vi.fn(),
  observeMailboxCounts: vi.fn(),
}));

vi.mock("react", () => ({
  useEffect: (effect: EffectCallback) => {
    mocks.effect = effect;
  },
}));
vi.mock("@inboxzero/mail-react/MailEngineProvider", () => ({
  useOptionalMailClient: () => ({
    observeMailboxCounts: mocks.observeMailboxCounts,
  }),
}));
vi.mock("@/providers/EmailAccountProvider", () => ({
  useAccount: () => mocks.account,
}));
vi.mock("@/utils/desktop-app", () => ({
  getInboxZeroDesktopApp: () => ({ setUnreadCount: mocks.setUnreadCount }),
}));

describe("desktop inbox badge subscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.account.emailAccountId = "selected";
    mocks.account.emailAccount = { account: { disconnectedAt: null } };
    mocks.unread = 4;
    mocks.observeMailboxCounts.mockImplementation((query) => ({
      getSnapshot: () => ({
        data: {
          counts: [
            {
              unreadConversations:
                query.accountIds.length === 1 ? mocks.unread : 103,
            },
          ],
        },
      }),
      subscribe: (listener: () => void) => {
        mocks.listener = listener;
        return mocks.unsubscribe;
      },
      close: mocks.close,
    }));
  });

  it("reports only unread conversations still in the selected account's inbox", () => {
    DesktopMailIndicators();
    mocks.effect?.();
    expect(mocks.observeMailboxCounts).toHaveBeenCalledWith({
      accountIds: ["selected"],
      targets: [{ id: "INBOX", predicate: { kind: "role", role: "inbox" } }],
    });
    expect(mocks.setUnreadCount).toHaveBeenLastCalledWith(4);
    mocks.unread = 3;
    mocks.listener?.();
    expect(mocks.setUnreadCount).toHaveBeenLastCalledWith(3);
  });

  it("closes the old subscription and follows an account switch", () => {
    DesktopMailIndicators();
    const cleanup = mocks.effect?.();
    if (typeof cleanup === "function") cleanup();
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(mocks.setUnreadCount).toHaveBeenLastCalledWith(0);
    mocks.account.emailAccountId = "other";
    mocks.unread = 99;
    DesktopMailIndicators();
    mocks.effect?.();
    expect(mocks.observeMailboxCounts).toHaveBeenLastCalledWith({
      accountIds: ["other"],
      targets: [{ id: "INBOX", predicate: { kind: "role", role: "inbox" } }],
    });
    expect(mocks.setUnreadCount).toHaveBeenLastCalledWith(99);
  });

  it.each([
    "missing",
    "disconnected",
    "unavailable",
  ])("clears the badge for a %s selected account", (state) => {
    if (state === "missing") mocks.account.emailAccountId = "";
    else if (state === "unavailable") mocks.account.emailAccount = undefined;
    else
      mocks.account.emailAccount = { account: { disconnectedAt: new Date() } };
    DesktopMailIndicators();
    mocks.effect?.();
    expect(mocks.observeMailboxCounts).not.toHaveBeenCalled();
    expect(mocks.setUnreadCount).toHaveBeenLastCalledWith(0);
  });
});
