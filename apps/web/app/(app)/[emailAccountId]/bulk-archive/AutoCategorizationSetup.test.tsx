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

  it("prevents dismissal before setup starts", async () => {
    const { AutoCategorizationSetup } = await import(
      "@/app/(app)/[emailAccountId]/bulk-archive/AutoCategorizationSetup"
    );

    render(<AutoCategorizationSetup open />);

    const setupDialogProps = mockSetupDialog.mock.calls[0]?.[0];

    expect(setupDialogProps.dialogContentProps.hideCloseButton).toBe(true);

    const interactOutsideEvent = { preventDefault: vi.fn() };
    setupDialogProps.dialogContentProps.onInteractOutside(interactOutsideEvent);
    expect(interactOutsideEvent.preventDefault).toHaveBeenCalledTimes(1);

    const escapeKeyEvent = { preventDefault: vi.fn() };
    setupDialogProps.dialogContentProps.onEscapeKeyDown(escapeKeyEvent);
    expect(escapeKeyEvent.preventDefault).toHaveBeenCalledTimes(1);
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

  it("dismisses the setup dialog after setup starts successfully", async () => {
    mockBulkCategorizeSendersAction.mockResolvedValue({
      data: { totalUncategorizedSenders: 12 },
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

  it("dismisses the setup dialog when all senders are already categorized", async () => {
    mockBulkCategorizeSendersAction.mockResolvedValue({
      data: { totalUncategorizedSenders: 0 },
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

  it("dismisses the setup dialog when the action resolves without data", async () => {
    mockBulkCategorizeSendersAction.mockResolvedValue({});

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
