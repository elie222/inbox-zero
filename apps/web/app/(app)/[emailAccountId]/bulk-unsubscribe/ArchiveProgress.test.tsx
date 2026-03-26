// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ArchiveProgress } from "./ArchiveProgress";

const mockUseSWR = vi.fn();
const mockUseQueueState = vi.fn();
const mockResetTotalThreads = vi.fn();

vi.mock("swr", () => ({
  default: (...args: Parameters<typeof mockUseSWR>) => mockUseSWR(...args),
}));

vi.mock("@/store/archive-queue", () => ({
  useQueueState: (...args: Parameters<typeof mockUseQueueState>) =>
    mockUseQueueState(...args),
  resetTotalThreads: (...args: Parameters<typeof mockResetTotalThreads>) =>
    mockResetTotalThreads(...args),
}));

describe("ArchiveProgress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prefers backend bulk archive progress when present", () => {
    mockUseSWR.mockReturnValue({
      data: {
        totalItems: 3,
        completedItems: 1,
      },
    });
    mockUseQueueState.mockReturnValue({
      totalThreads: 4,
      activeThreads: {
        "archive-thread-1": { threadId: "thread-1", actionType: "archive" },
      },
    });

    render(<ArchiveProgress />);

    expect(screen.getByText("Archiving senders...")).toBeTruthy();
    expect(screen.getByText("1 of 3 senders processed")).toBeTruthy();
    expect(screen.queryByText("3 of 4 emails processed")).toBeNull();
  });

  it("falls back to the local archive queue progress", () => {
    mockUseSWR.mockReturnValue({ data: null });
    mockUseQueueState.mockReturnValue({
      totalThreads: 4,
      activeThreads: {
        "archive-thread-1": { threadId: "thread-1", actionType: "archive" },
      },
    });

    render(<ArchiveProgress />);

    expect(screen.getByText("Archiving emails...")).toBeTruthy();
    expect(screen.getByText("3 of 4 emails processed")).toBeTruthy();
  });
});
