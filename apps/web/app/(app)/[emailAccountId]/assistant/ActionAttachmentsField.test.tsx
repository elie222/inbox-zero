/** @vitest-environment jsdom */

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AttachmentSourceType } from "@/generated/prisma/enums";
import { ActionAttachmentsField } from "./ActionAttachmentsField";

const mockUseDriveConnections = vi.fn();
const mockUseDriveSourceItems = vi.fn();
const mockUseDriveSourceChildren = vi.fn();

(globalThis as { React?: typeof React }).React = React;

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

(globalThis as { ResizeObserver?: typeof MockResizeObserver }).ResizeObserver =
  MockResizeObserver;

vi.mock("@/hooks/useDriveConnections", () => ({
  useDriveConnections: () => mockUseDriveConnections(),
}));

vi.mock("@/hooks/useDriveSourceItems", () => ({
  useDriveSourceItems: () => mockUseDriveSourceItems(),
}));

vi.mock("@/hooks/useDriveSourceChildren", () => ({
  useDriveSourceChildren: () => mockUseDriveSourceChildren(),
}));

vi.mock("@/utils/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/utils/prisma");

describe("ActionAttachmentsField", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDriveConnections.mockReturnValue({
      data: { connections: [{ id: "drive-connection-1" }] },
    });
    mockUseDriveSourceItems.mockReturnValue({
      data: {
        items: [
          {
            id: "file-1",
            name: "Quarterly report.pdf",
            path: "Quarterly report.pdf",
            driveConnectionId: "drive-connection-1",
            provider: "google",
            type: "file",
          },
        ],
      },
      isLoading: false,
      error: undefined,
    });
    mockUseDriveSourceChildren.mockReturnValue({
      data: { items: [] },
      isLoading: false,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("applies always-attach selections only after saving the picker", () => {
    const onChange = vi.fn();
    renderField({ onChange });

    fireEvent.click(screen.getByRole("button", { name: "Select files" }));
    fireEvent.click(screen.getByRole("checkbox"));

    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onChange).toHaveBeenCalledWith([
      {
        driveConnectionId: "drive-connection-1",
        name: "Quarterly report.pdf",
        sourceId: "file-1",
        sourcePath: "Quarterly report.pdf",
        type: AttachmentSourceType.FILE,
      },
    ]);
  });

  it("discards always-attach selections when the picker is canceled", () => {
    const onChange = vi.fn();
    renderField({ onChange });

    fireEvent.click(screen.getByRole("button", { name: "Select files" }));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onChange).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("heading", {
        name: "Select files to always attach",
      }),
    ).toBeNull();
  });

  it("discards AI source picker selections when the modal is closed", () => {
    const onAttachmentSourcesChange = vi.fn();
    renderField({ onAttachmentSourcesChange });

    fireEvent.click(
      screen.getByRole("button", { name: "Select sources for AI" }),
    );
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onAttachmentSourcesChange).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("heading", {
        name: "Select sources for AI to search",
      }),
    ).toBeNull();
  });
});

function renderField({
  onChange = vi.fn(),
  onAttachmentSourcesChange = vi.fn(),
}: {
  onChange?: (
    value: Parameters<typeof ActionAttachmentsField>[0]["value"],
  ) => void;
  onAttachmentSourcesChange?: (
    value: Parameters<typeof ActionAttachmentsField>[0]["attachmentSources"],
  ) => void;
} = {}) {
  render(
    <ActionAttachmentsField
      value={[]}
      onChange={onChange}
      emailAccountId="email-account-1"
      contentSetManually
      attachmentSources={[]}
      onAttachmentSourcesChange={onAttachmentSourcesChange}
    />,
  );
}
