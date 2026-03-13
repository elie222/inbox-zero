/** @vitest-environment jsdom */

import React, { type ReactNode } from "react";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { React?: typeof React }).React = React;

const mockSetupDialog = vi.fn();
const mockUseAccount = vi.fn();
const mockUseCategorizeProgress = vi.fn();

vi.mock("@/components/SetupCard", () => ({
  SetupDialog: (props: { children: ReactNode }) => {
    mockSetupDialog(props);
    return <div>{props.children}</div>;
  },
}));

vi.mock("@/providers/EmailAccountProvider", () => ({
  useAccount: () => mockUseAccount(),
}));

vi.mock("@/app/(app)/[emailAccountId]/smart-categories/CategorizeProgress", () => ({
  useCategorizeProgress: () => mockUseCategorizeProgress(),
}));

vi.mock("@/utils/actions/categorize", () => ({
  bulkCategorizeSendersAction: vi.fn(),
}));

vi.mock("@/components/Toast", () => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

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

  it("prevents accidental dismissal from the backdrop or escape key", async () => {
    const { AutoCategorizationSetup } = await import(
      "@/app/(app)/[emailAccountId]/bulk-archive/AutoCategorizationSetup"
    );

    render(<AutoCategorizationSetup open />);

    const setupDialogProps = mockSetupDialog.mock.calls[0]?.[0];

    expect(setupDialogProps.dialogContentProps.hideCloseButton).toBe(true);

    const interactOutsideEvent = { preventDefault: vi.fn() };
    setupDialogProps.dialogContentProps.onInteractOutside(
      interactOutsideEvent,
    );
    expect(interactOutsideEvent.preventDefault).toHaveBeenCalledTimes(1);

    const escapeKeyEvent = { preventDefault: vi.fn() };
    setupDialogProps.dialogContentProps.onEscapeKeyDown(escapeKeyEvent);
    expect(escapeKeyEvent.preventDefault).toHaveBeenCalledTimes(1);
  });
});
