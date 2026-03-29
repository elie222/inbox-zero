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
      try {
        const result = await runner();
        messages?.success?.(result);
        return result;
      } catch (error) {
        messages?.error?.(error);
        throw error;
      }
    });
  });

  it("stops bulk categorizing and shows an already-categorized message when no work is left", async () => {
    mockBulkCategorizeSendersAction.mockResolvedValue({
      data: { totalUncategorizedSenders: 0 },
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
      }),
    ).toBe("No more senders to categorize right now.");
  });

  it("shows a fallback success message when the action resolves without data", async () => {
    mockBulkCategorizeSendersAction.mockResolvedValue({});

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
    expect(toastMessages.success(undefined)).toBe("Categorization started.");
  });

  it("stops bulk categorizing when the action throws", async () => {
    mockBulkCategorizeSendersAction.mockRejectedValue(
      new Error("Queue publish failed"),
    );

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
    expect(toastMessages.error(new Error("Queue publish failed"))).toBe(
      "Error categorizing senders: Queue publish failed",
    );
  });
});
