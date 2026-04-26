/** @vitest-environment jsdom */

import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseSWR = vi.fn();
const mockProgressPanel = vi.fn();

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

describe("CategorizeSendersProgress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the real backend progress without faking additional completed items", async () => {
    mockUseSWR.mockReturnValue({
      data: { totalItems: 10, completedItems: 4 },
    });

    const { CategorizeSendersProgress } = await import(
      "@/app/(app)/[emailAccountId]/smart-categories/CategorizeProgress"
    );

    render(<CategorizeSendersProgress refresh />);

    expect(screen.getByText("6 remaining / 10 total")).toBeTruthy();
    expect(mockProgressPanel).toHaveBeenCalledWith(
      expect.objectContaining({
        totalItems: 10,
        remainingItems: 6,
        completedText: "Categorization complete! 4 categorized!",
      }),
    );
  });
});
