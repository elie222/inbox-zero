/** @vitest-environment jsdom */

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockProgressPanel = vi.fn();
const mockUseArchiveQueueProgress = vi.fn();

(globalThis as { React?: typeof React }).React = React;

vi.mock("@/components/ProgressPanel", () => ({
  ProgressPanel: (props: {
    totalItems: number;
    remainingItems: number;
    completedText: string;
  }) => {
    mockProgressPanel(props);
    return (
      <div>
        {props.remainingItems} remaining / {props.totalItems} total
      </div>
    );
  },
}));

vi.mock("@/store/archive-sender-queue", () => ({
  useArchiveQueueProgress: () => mockUseArchiveQueueProgress(),
}));

vi.mock("@/providers/EmailAccountProvider", () => ({
  useAccount: () => ({ emailAccountId: "account-1" }),
}));

describe("BulkArchiveProgress", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mockUseArchiveQueueProgress.mockReturnValue(undefined);
  });

  it("shows completed local queue progress", async () => {
    mockUseArchiveQueueProgress.mockReturnValue({
      activeItems: 0,
      totalItems: 8,
      completedItems: 8,
      failedItems: 0,
      settledItems: 8,
    });

    const { BulkArchiveProgress } = await import(
      "@/app/(app)/[emailAccountId]/bulk-archive/BulkArchiveProgress"
    );

    render(<BulkArchiveProgress />);

    expect(screen.getByText("0 remaining / 8 total")).toBeTruthy();
    expect(mockProgressPanel).toHaveBeenCalledWith(
      expect.objectContaining({
        totalItems: 8,
        remainingItems: 0,
        completedText: "Archiving complete! 8 senders processed!",
      }),
    );
  });

  it("settles failed work without presenting it as successful", async () => {
    mockUseArchiveQueueProgress.mockReturnValue({
      activeItems: 0,
      totalItems: 8,
      completedItems: 6,
      failedItems: 2,
      settledItems: 8,
    });
    const { BulkArchiveProgress } = await import(
      "@/app/(app)/[emailAccountId]/bulk-archive/BulkArchiveProgress"
    );

    render(<BulkArchiveProgress />);

    expect(screen.getByText("0 remaining / 8 total")).toBeTruthy();
    expect(mockProgressPanel).toHaveBeenCalledWith(
      expect.objectContaining({
        remainingItems: 0,
        completedText: "Archiving finished: 6 succeeded, 2 failed.",
      }),
    );
  });
});
