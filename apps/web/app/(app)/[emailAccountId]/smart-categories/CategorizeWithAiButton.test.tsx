/** @vitest-environment jsdom */

import React, { createElement, type ReactNode } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockBulkCategorizeSendersAction = vi.fn();
const mockSetIsBulkCategorizing = vi.fn();
const mockToastPromise = vi.fn();

(globalThis as { React?: typeof React }).React = React;

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children?: ReactNode;
    onClick?: () => void | Promise<void>;
    disabled?: boolean;
  }) =>
    createElement(
      "button",
      {
        type: "button",
        onClick,
        disabled,
      },
      children,
    ),
}));

vi.mock("@/components/Tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/components/PremiumAlert", () => ({
  PremiumTooltip: ({ children }: { children: ReactNode }) => children,
  usePremium: () => ({ hasAiAccess: true }),
}));

vi.mock("@/app/(app)/premium/PremiumModal", () => ({
  usePremiumModal: () => ({
    PremiumModal: () => null,
    openModal: vi.fn(),
  }),
}));

vi.mock("@/providers/EmailAccountProvider", () => ({
  useAccount: () => ({ emailAccountId: "account-1" }),
}));

vi.mock(
  "@/app/(app)/[emailAccountId]/smart-categories/CategorizeProgress",
  () => ({
    useCategorizeProgress: () => ({
      setIsBulkCategorizing: mockSetIsBulkCategorizing,
    }),
  }),
);

vi.mock("@/utils/actions/categorize", () => ({
  bulkCategorizeSendersAction: (
    ...args: Parameters<typeof mockBulkCategorizeSendersAction>
  ) => mockBulkCategorizeSendersAction(...args),
}));

vi.mock("sonner", () => ({
  toast: {
    promise: (...args: Parameters<typeof mockToastPromise>) =>
      mockToastPromise(...args),
  },
}));

afterEach(() => {
  cleanup();
});

describe("CategorizeWithAiButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockToastPromise.mockImplementation(async (runner, messages) => {
      const result = await runner();
      messages?.success?.(result);
      return result;
    });
  });

  it("stops bulk categorizing and shows an empty-sync message when no emails have synced yet", async () => {
    mockBulkCategorizeSendersAction.mockResolvedValue({
      data: { totalUncategorizedSenders: 0, hasSyncedMessages: false },
    });

    const { CategorizeWithAiButton } = await import(
      "@/app/(app)/[emailAccountId]/smart-categories/CategorizeWithAiButton"
    );

    render(<CategorizeWithAiButton />);

    fireEvent.click(screen.getByRole("button", { name: "Categorize" }));

    await waitFor(() => {
      expect(mockSetIsBulkCategorizing).toHaveBeenNthCalledWith(1, true);
      expect(mockSetIsBulkCategorizing).toHaveBeenNthCalledWith(2, false);
    });

    const [, toastMessages] = mockToastPromise.mock.calls[0];
    expect(
      toastMessages.success({
        totalUncategorizedSenders: 0,
        hasSyncedMessages: false,
      }),
    ).toBe("No emails have been synced yet.");
  });

  it("stops bulk categorizing and shows an already-categorized message when no work is left", async () => {
    mockBulkCategorizeSendersAction.mockResolvedValue({
      data: { totalUncategorizedSenders: 0, hasSyncedMessages: true },
    });

    const { CategorizeWithAiButton } = await import(
      "@/app/(app)/[emailAccountId]/smart-categories/CategorizeWithAiButton"
    );

    render(<CategorizeWithAiButton />);

    fireEvent.click(screen.getByRole("button", { name: "Categorize" }));

    await waitFor(() => {
      expect(mockSetIsBulkCategorizing).toHaveBeenNthCalledWith(1, true);
      expect(mockSetIsBulkCategorizing).toHaveBeenNthCalledWith(2, false);
    });

    const [, toastMessages] = mockToastPromise.mock.calls[0];
    expect(
      toastMessages.success({
        totalUncategorizedSenders: 0,
        hasSyncedMessages: true,
      }),
    ).toBe("All current senders are already categorized.");
  });
});
