// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ArchiveProgress } from "./ArchiveProgress";

const mockUseArchiveQueueProgress = vi.fn();
const mockUseQueueState = vi.fn();
const mockResetTotalThreads = vi.fn();

vi.mock("@/store/archive-queue", () => ({
  useQueueState: (...args: Parameters<typeof mockUseQueueState>) =>
    mockUseQueueState(...args),
  resetTotalThreads: (...args: Parameters<typeof mockResetTotalThreads>) =>
    mockResetTotalThreads(...args),
}));

vi.mock("@/store/archive-sender-queue", () => ({
  useArchiveQueueProgress: (
    ...args: Parameters<typeof mockUseArchiveQueueProgress>
  ) => mockUseArchiveQueueProgress(...args),
}));

vi.mock("@/providers/EmailAccountProvider", () => ({
  useAccount: () => ({ emailAccountId: "account-1" }),
}));

describe("ArchiveProgress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseArchiveQueueProgress.mockReturnValue(undefined);
  });

  it("prefers sender archive progress when present", () => {
    mockUseArchiveQueueProgress.mockReturnValue({
      totalItems: 3,
      completedItems: 1,
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
