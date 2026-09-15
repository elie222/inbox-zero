/** @vitest-environment jsdom */

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MailAccountSwitcher } from "./MailAccountSwitcher";

(globalThis as { React?: typeof React }).React = React;

const { mockOpenWindow, mockUseAccounts, mockUseAccount } = vi.hoisted(() => ({
  mockOpenWindow: vi.fn().mockResolvedValue(undefined),
  mockUseAccounts: vi.fn(),
  mockUseAccount: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

vi.mock("@/hooks/useAccounts", () => ({
  useAccounts: () => mockUseAccounts(),
}));

vi.mock("@/providers/EmailAccountProvider", () => ({
  useAccount: () => mockUseAccount(),
}));

vi.mock("@/utils/desktop-app", () => ({
  getInboxZeroDesktopApp: () => ({ openWindow: mockOpenWindow }),
}));

vi.mock("./AllAccountsSelectionDialog", () => ({
  AllAccountsSelectionDialog: () => null,
}));

vi.mock("@/components/ui/dropdown-menu", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/components/ui/dropdown-menu")>();
  return {
    ...actual,
    DropdownMenu: (props: React.ComponentProps<typeof actual.DropdownMenu>) => (
      <actual.DropdownMenu {...props} modal={false} open />
    ),
  };
});

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

(globalThis as { ResizeObserver?: typeof MockResizeObserver }).ResizeObserver =
  MockResizeObserver;

if (!HTMLElement.prototype.hasPointerCapture) {
  HTMLElement.prototype.hasPointerCapture = () => false;
}
if (!HTMLElement.prototype.setPointerCapture) {
  HTMLElement.prototype.setPointerCapture = () => {};
}
if (!HTMLElement.prototype.releasePointerCapture) {
  HTMLElement.prototype.releasePointerCapture = () => {};
}
if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = () => {};
}

afterEach(() => {
  cleanup();
});

describe("MailAccountSwitcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAccount.mockReturnValue({
      emailAccount: {
        id: "account-1",
        name: "Work",
        email: "work@example.com",
        image: null,
      },
    });
    mockUseAccounts.mockReturnValue({
      data: {
        emailAccounts: [
          {
            id: "account-1",
            email: "work@example.com",
            name: "Work",
            image: null,
            accountId: "auth-1",
            includeInAllAccounts: true,
            account: { disconnectedAt: null, provider: "google" },
            user: {
              name: "Work",
              image: null,
              email: "work@example.com",
            },
            isPrimary: true,
            providerRateLimit: null,
          },
          {
            id: "account-2",
            email: "personal@example.com",
            name: "Personal",
            image: null,
            accountId: "auth-2",
            includeInAllAccounts: true,
            account: { disconnectedAt: null, provider: "google" },
            user: {
              name: "Personal",
              image: null,
              email: "personal@example.com",
            },
            isPrimary: false,
            providerRateLimit: null,
          },
        ],
      },
      mutate: vi.fn(),
    });
  });

  it.each([
    { metaKey: true },
    { ctrlKey: true },
  ])("opens a desktop window when an account is selected with %o", async (modifiers) => {
    const onSelectAccount = vi.fn();
    renderSwitcher({ onSelectAccount });

    const item = await screen.findByRole("menuitem", { name: /personal/i });
    selectMenuItem(item, modifiers);

    expect(mockOpenWindow).toHaveBeenCalledWith("/account-2/mail");
    expect(onSelectAccount).not.toHaveBeenCalled();
  });

  it("switches accounts when a DropdownMenuItem is selected without modifiers", async () => {
    const onSelectAccount = vi.fn();
    renderSwitcher({ onSelectAccount });

    const item = await screen.findByRole("menuitem", { name: /personal/i });
    selectMenuItem(item);

    expect(onSelectAccount).toHaveBeenCalledWith("account-2");
    expect(mockOpenWindow).not.toHaveBeenCalled();
  });
});

function renderSwitcher({
  onSelectAccount,
}: {
  onSelectAccount: (accountId: string) => void;
}) {
  return render(
    <MailAccountSwitcher
      isAllAccounts={false}
      isDesktopApp
      onSelectAccount={onSelectAccount}
      onSelectAll={vi.fn()}
      variant="compact"
    />,
  );
}

function selectMenuItem(
  item: HTMLElement,
  modifiers: { metaKey?: boolean; ctrlKey?: boolean } = {},
) {
  fireEvent.pointerDown(item, {
    button: 0,
    pointerType: "mouse",
    ...modifiers,
  });
  fireEvent.pointerUp(item, {
    button: 0,
    pointerType: "mouse",
    ...modifiers,
  });
  fireEvent.click(item);
}
