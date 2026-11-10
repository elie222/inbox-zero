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

const { mockUseAccount, mockUseLabels, mockUseFolders } = vi.hoisted(() => ({
  mockUseAccount: vi.fn(),
  mockUseLabels: vi.fn(),
  mockUseFolders: vi.fn(),
}));

vi.mock("@/providers/EmailAccountProvider", () => ({
  useAccount: () => mockUseAccount(),
}));

vi.mock("@/hooks/useLabels", () => ({
  isLabelsKey: () => true,
  isHiddenLabel: (label: { labelListVisibility?: string }) =>
    label.labelListVisibility === "labelHide",
  useLabels: () => mockUseLabels(),
}));

vi.mock("@/hooks/useFolders", () => ({
  useFolders: (provider: string) => mockUseFolders(provider),
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
    const onApply = vi.fn().mockResolvedValue(["thread-1"]);
    const onClose = vi.fn();

    render(
      <LabelPickerDialog
        mode="move"
        threadKeys={["thread-1"]}
        onClose={onClose}
        onApply={onApply}
      />,
    );

    expect(screen.queryByText("Category One")).toBeNull();
    expect(screen.queryByText("Inbox")).toBeNull();
    expect(screen.getByText("Inbox / Nested")).toBeTruthy();
    fireEvent.click(screen.getByText("Projects"));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onApply).toHaveBeenCalledWith(["thread-1"], {
      kind: "folder",
      id: "folder-id",
    });
  });

  it("moves Gmail conversations with a label", async () => {
    mockUseAccount.mockReturnValue({
      emailAccountId: "account-1",
      provider: "google",
    });
    const onApply = vi.fn().mockResolvedValue(["thread-1"]);

    render(
      <LabelPickerDialog
        mode="move"
        threadKeys={["thread-1"]}
        onClose={vi.fn()}
        onApply={onApply}
      />,
    );

    fireEvent.click(screen.getByText("Category One"));

    await waitFor(() =>
      expect(onApply).toHaveBeenCalledWith(["thread-1"], {
        kind: "label",
        id: "category-1",
      }),
    );
  });

  it("stays open with only the conversations that failed, so a pick retries them", async () => {
    mockUseAccount.mockReturnValue({
      emailAccountId: "account-1",
      provider: "google",
    });
    const onApply = vi
      .fn()
      .mockResolvedValueOnce(["thread-1"])
      .mockResolvedValueOnce(["thread-2"]);
    const onClose = vi.fn();

    render(
      <LabelPickerDialog
        threadKeys={["thread-1", "thread-2"]}
        onClose={onClose}
        onApply={onApply}
      />,
    );

    fireEvent.click(screen.getByText("Category One"));
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Category One"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onApply).toHaveBeenLastCalledWith(["thread-2"], {
      kind: "label",
      id: "category-1",
    });
  });

  it("lists labels in sidebar order with hidden labels last", () => {
    mockUseAccount.mockReturnValue({
      emailAccountId: "account-1",
      provider: "google",
    });
    mockUseLabels.mockReturnValue({
      userLabels: [
        {
          id: "hidden",
          name: "Archive Later",
          type: "user",
          labelListVisibility: "labelHide",
        },
        { id: "zeta", name: "Zeta", type: "user" },
        { id: "bracket", name: "[Superhuman]/Muted", type: "user" },
      ],
      isLoading: false,
      error: undefined,
      mutate: vi.fn(),
    });

    render(
      <LabelPickerDialog
        threadKeys={["thread-1"]}
        onClose={vi.fn()}
        onApply={vi.fn()}
      />,
    );

    expect(
      screen.getAllByRole("option").map((option) => option.textContent),
    ).toEqual(["Zeta", "[Superhuman]/Muted", "Archive Later"]);
  });
});
