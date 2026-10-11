/** @vitest-environment jsdom */

import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AttachmentSourceType } from "@/generated/prisma/enums";
import type { AttachmentSourceInput } from "@/utils/attachments/source-schema";
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

  it("labels a single AI folder as a folder", () => {
    renderField({
      attachmentSources: [badgeSource("folder-1", AttachmentSourceType.FOLDER)],
    });

    expect(
      within(
        screen.getByRole("button", { name: /^AI-selected sources/ }),
      ).getByText("1 folder"),
    ).toBeTruthy();
    expect(screen.getAllByText("1 folder")).toHaveLength(2);
  });

  it("labels mixed AI sources with folders first", () => {
    renderField({
      attachmentSources: [
        badgeSource("file-1", AttachmentSourceType.FILE),
        badgeSource("folder-1", AttachmentSourceType.FOLDER),
        badgeSource("folder-2", AttachmentSourceType.FOLDER),
      ],
    });

    expect(
      within(
        screen.getByRole("button", { name: /^AI-selected sources/ }),
      ).getByText("2 folders, 1 file"),
    ).toBeTruthy();
    expect(screen.getAllByText("2 folders, 1 file")).toHaveLength(2);
  });

  it("counts files in both sections in the header without deduplicating", () => {
    const file = badgeSource("file-1", AttachmentSourceType.FILE);
    renderField({
      value: [file, badgeSource("file-2", AttachmentSourceType.FILE)],
      attachmentSources: [
        file,
        badgeSource("folder-1", AttachmentSourceType.FOLDER),
      ],
    });

    expect(
      within(screen.getByRole("button", { name: /^Always attach/ })).getByText(
        "2 files",
      ),
    ).toBeTruthy();
    expect(
      within(
        screen.getByRole("button", { name: /^AI-selected sources/ }),
      ).getByText("1 folder, 1 file"),
    ).toBeTruthy();
    expect(screen.getByText("1 folder, 3 files")).toBeTruthy();
  });

  it("excludes disabled AI sources from the header", () => {
    renderField({
      value: [badgeSource("file-1", AttachmentSourceType.FILE)],
      attachmentSources: [badgeSource("folder-1", AttachmentSourceType.FOLDER)],
      allowAiSelectedSources: false,
    });

    expect(screen.getAllByText("1 file")).toHaveLength(2);
    expect(screen.queryByText("1 folder")).toBeNull();
  });

  it("keeps badges hidden for empty selections", () => {
    renderField();

    expect(screen.getByText("Attachments").parentElement?.textContent).toBe(
      "Attachments",
    );
    expect(screen.getByRole("button", { name: "Always attach" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "AI-selected sources" }),
    ).toBeTruthy();
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
  value = [],
  attachmentSources = [],
  allowAiSelectedSources = true,
  onChange = vi.fn(),
  onAttachmentSourcesChange = vi.fn(),
}: {
  value?: AttachmentSourceInput[];
  attachmentSources?: AttachmentSourceInput[];
  allowAiSelectedSources?: boolean;
  onChange?: (
    value: Parameters<typeof ActionAttachmentsField>[0]["value"],
  ) => void;
  onAttachmentSourcesChange?: (
    value: Parameters<typeof ActionAttachmentsField>[0]["attachmentSources"],
  ) => void;
} = {}) {
  render(
    <ActionAttachmentsField
      value={value}
      onChange={onChange}
      emailAccountId="email-account-1"
      contentSetManually
      attachmentSources={attachmentSources}
      allowAiSelectedSources={allowAiSelectedSources}
      onAttachmentSourcesChange={onAttachmentSourcesChange}
    />,
  );
}

function badgeSource(
  sourceId: string,
  type: AttachmentSourceType,
): AttachmentSourceInput {
  return {
    driveConnectionId: "drive-connection-1",
    sourceId,
    name:
      type === AttachmentSourceType.FOLDER ? "Demo Certificates" : "Demo.pdf",
    type,
  };
}
