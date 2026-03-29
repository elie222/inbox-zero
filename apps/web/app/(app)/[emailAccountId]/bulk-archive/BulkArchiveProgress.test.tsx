/** @vitest-environment jsdom */

import React from "react";
import { render, screen } from "@testing-library/react";
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
    vi.clearAllMocks();
    mockUseArchiveQueueProgress.mockReturnValue(undefined);
  });

  it("shows completed local queue progress", async () => {
    mockUseArchiveQueueProgress.mockReturnValue({
      totalItems: 8,
      completedItems: 8,
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
});
