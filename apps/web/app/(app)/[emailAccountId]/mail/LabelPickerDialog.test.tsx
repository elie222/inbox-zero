/** @vitest-environment jsdom */

import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LabelPickerDialog } from "./LabelPickerDialog";

(globalThis as { React?: typeof React }).React = React;

const { mockUseAccount, mockUseLabels, mockUseFolders, mockClient } =
  vi.hoisted(() => ({
    mockUseAccount: vi.fn(),
    mockUseLabels: vi.fn(),
    mockUseFolders: vi.fn(),
    mockClient: {
      getDiagnostics: vi.fn(),
      submitConversations: vi.fn(),
    },
  }));

vi.mock("@/providers/EmailAccountProvider", () => ({
  useAccount: () => mockUseAccount(),
}));

vi.mock("@/hooks/useLabels", () => ({
  useLabels: () => mockUseLabels(),
}));

vi.mock("@/hooks/useFolders", () => ({
  useFolders: (provider: string) => mockUseFolders(provider),
}));

vi.mock("@inboxzero/mail-react/MailEngineProvider", () => ({
  useOptionalMailClient: () => mockClient,
}));

vi.mock("@/components/LoadingContent", () => ({
  LoadingContent: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/utils/actions/mail", () => ({
  createLabelAction: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

(globalThis as { ResizeObserver?: typeof MockResizeObserver }).ResizeObserver =
  MockResizeObserver;

if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = () => {};
}

describe("LabelPickerDialog", () => {
  beforeEach(() => {
    mockUseLabels.mockReturnValue({
      userLabels: [{ id: "category-1", name: "Category One", type: "user" }],
      isLoading: false,
      error: undefined,
      mutate: vi.fn(),
    });
    mockUseFolders.mockReturnValue({
      folders: [
        {
          id: "inbox-id",
          displayName: "Inbox",
          systemType: "INBOX",
          childFolders: [
            { id: "child-id", displayName: "Nested", childFolders: [] },
          ],
        },
        { id: "folder-id", displayName: "Projects", childFolders: [] },
      ],
      isLoading: false,
      error: undefined,
    });
    mockClient.getDiagnostics.mockResolvedValue({ revision: 1 });
    mockClient.submitConversations.mockResolvedValue({ status: "queued" });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("moves Outlook conversations into a mail folder instead of a category", async () => {
    mockUseAccount.mockReturnValue({
      emailAccountId: "account-1",
      provider: "microsoft",
    });
    const onApplied = vi.fn();

    render(
      <LabelPickerDialog
        mode="move"
        threadIds={["thread-1"]}
        onClose={vi.fn()}
        onApplied={onApplied}
      />,
    );

    expect(screen.queryByText("Category One")).toBeNull();
    expect(screen.queryByText("Inbox")).toBeNull();
    expect(screen.getByText("Inbox / Nested")).toBeTruthy();
    fireEvent.click(screen.getByText("Projects"));

    await waitFor(() => expect(onApplied).toHaveBeenCalled());
    expect(mockClient.submitConversations).toHaveBeenCalledTimes(1);
    expect(mockClient.submitConversations).toHaveBeenCalledWith(
      expect.objectContaining({
        change: { kind: "move", folderId: "folder-id" },
      }),
    );
  });

  it("moves Gmail conversations by labeling and archiving", async () => {
    mockUseAccount.mockReturnValue({
      emailAccountId: "account-1",
      provider: "google",
    });
    const onApplied = vi.fn();

    render(
      <LabelPickerDialog
        mode="move"
        threadIds={["thread-1"]}
        onClose={vi.fn()}
        onApplied={onApplied}
      />,
    );

    fireEvent.click(screen.getByText("Category One"));

    await waitFor(() => expect(onApplied).toHaveBeenCalled());
    expect(
      mockClient.submitConversations.mock.calls.map(([call]) => call.change),
    ).toEqual([
      {
        kind: "set_membership",
        membership: "label",
        id: "category-1",
        present: true,
      },
      { kind: "archive" },
    ]);
  });
});
