/** @vitest-environment jsdom */

import React, { type ReactNode } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { React?: typeof React }).React = React;

const mockSetupDialog = vi.fn();
const mockUseAccount = vi.fn();
const mockUseCategorizeProgress = vi.fn();
const mockBulkCategorizeSendersAction = vi.fn();

vi.mock("@/components/SetupCard", () => ({
  SetupDialog: (props: {
    children: ReactNode;
    open: boolean;
    onOpenChange?: (open: boolean) => void;
  }) => {
    mockSetupDialog(props);
    return props.open ? <div>{props.children}</div> : null;
  },
}));

vi.mock("@/providers/EmailAccountProvider", () => ({
  useAccount: () => mockUseAccount(),
}));

vi.mock(
  "@/app/(app)/[emailAccountId]/smart-categories/CategorizeProgress",
  () => ({
    useCategorizeProgress: () => mockUseCategorizeProgress(),
  }),
);

vi.mock("@/utils/actions/categorize", () => ({
  bulkCategorizeSendersAction: (
    ...args: Parameters<typeof mockBulkCategorizeSendersAction>
  ) => mockBulkCategorizeSendersAction(...args),
}));

vi.mock("@/components/Toast", () => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

afterEach(() => {
  cleanup();
});

describe("AutoCategorizationSetup", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseAccount.mockReturnValue({
      emailAccountId: "account-1",
    });

    mockUseCategorizeProgress.mockReturnValue({
      setIsBulkCategorizing: vi.fn(),
    });
  });

  it("allows the setup dialog to be dismissed", async () => {
    const { AutoCategorizationSetup } = await import(
      "@/app/(app)/[emailAccountId]/bulk-archive/AutoCategorizationSetup"
    );

    render(<AutoCategorizationSetup open />);

    const setupDialogProps = mockSetupDialog.mock.calls[0]?.[0];

    expect(setupDialogProps.dialogContentProps).toBeUndefined();
  });

  it("dismisses the setup dialog after a premium access error", async () => {
    mockBulkCategorizeSendersAction.mockResolvedValue({
      serverError: "Please upgrade for AI access",
    });

    const onOpenChange = vi.fn();

    const { AutoCategorizationSetup } = await import(
      "@/app/(app)/[emailAccountId]/bulk-archive/AutoCategorizationSetup"
    );

    render(<AutoCategorizationSetup open onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Get Started" }));

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
