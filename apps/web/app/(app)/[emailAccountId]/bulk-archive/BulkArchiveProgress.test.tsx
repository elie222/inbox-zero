/** @vitest-environment jsdom */

import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseSWR = vi.fn();
const mockProgressPanel = vi.fn();
const mockUseCategorizeProgress = vi.fn();

(globalThis as { React?: typeof React }).React = React;

vi.mock("swr", () => ({
  default: (...args: Parameters<typeof mockUseSWR>) => mockUseSWR(...args),
}));

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

vi.mock(
  "@/app/(app)/[emailAccountId]/smart-categories/CategorizeProgress",
  () => ({
    useCategorizeProgress: () => mockUseCategorizeProgress(),
  }),
);

describe("BulkArchiveProgress", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseCategorizeProgress.mockReturnValue({
      isBulkCategorizing: false,
      setIsBulkCategorizing: vi.fn(),
    });
  });

  it("shows completed backend progress after a refresh", async () => {
    mockUseSWR.mockReturnValue({
      data: { totalItems: 8, completedItems: 8 },
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
        completedText: "Categorization complete! 8 senders categorized!",
      }),
    );
  });
});
