// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ArchiveProgress } from "./ArchiveProgress";

const mockUseArchiveQueueProgress = vi.fn();
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

  it("renders durable sender archive progress", () => {
    mockUseArchiveQueueProgress.mockReturnValue({
      activeItems: 2,
      totalItems: 3,
      completedItems: 1,
      failedItems: 0,
      settledItems: 1,
    });
    render(<ArchiveProgress />);

    expect(screen.getByText("Archiving senders...")).toBeTruthy();
    expect(screen.getByText("1 of 3 senders processed")).toBeTruthy();
  });

  it("settles failed work without presenting it as successful", () => {
    mockUseArchiveQueueProgress.mockReturnValue({
      activeItems: 0,
      totalItems: 3,
      completedItems: 2,
      failedItems: 1,
      settledItems: 3,
    });
    render(<ArchiveProgress />);

    expect(
      screen.getByText("Archiving finished: 2 succeeded, 1 failed."),
    ).toBeTruthy();
    expect(screen.getByText("3 of 3 senders processed")).toBeTruthy();
  });

  it("stays hidden without a durable sender batch", () => {
    const { container } = render(<ArchiveProgress />);
    expect(container.firstChild).toBeNull();
  });
});
