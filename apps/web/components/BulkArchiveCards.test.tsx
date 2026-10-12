// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BulkArchiveCards } from "@/components/BulkArchiveCards";
import { useThreads } from "@/hooks/useThreads";
import { useAccount } from "@/providers/EmailAccountProvider";

vi.mock("nuqs", () => ({
  useQueryState: () => ["Uncategorized", vi.fn()],
}));

vi.mock("@/hooks/useThreads", () => ({
  useThreads: vi.fn(() => ({
    data: { threads: [] },
    isLoading: false,
    error: undefined,
  })),
}));

vi.mock("@/providers/EmailAccountProvider", () => ({
  useAccount: vi.fn(),
}));

vi.mock("@/utils/actions/categorize", () => ({
  changeSenderCategoryAction: vi.fn(),
}));

vi.mock("@/store/archive-sender-queue", () => ({
  useArchiveSenderStatus: () => undefined,
  useArchiveSenderQueueActions: () => ({ queueArchiveSenders: vi.fn() }),
}));

vi.mock("@/store/mark-read-sender-queue", () => ({
  useMarkReadSenderStatus: () => undefined,
  addToMarkReadSenderQueue: vi.fn(),
}));

vi.mock("@/store/delete-sender-queue", () => ({
  useDeleteSenderStatus: () => undefined,
  addToDeleteSenderQueue: vi.fn(),
}));

vi.mock("@/components/EmailCell", () => ({
  EmailCell: ({ emailAddress }: { emailAddress: string }) => (
    <span>{emailAddress}</span>
  ),
}));

describe("Bulk Archive sender preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it.each([
    "google",
    "microsoft",
  ] as const)("requests only inbox threads when expanding a sender on %s", (provider) => {
    vi.mocked(useAccount).mockReturnValue({
      emailAccountId: "account-1",
      userEmail: "user@example.com",
      provider,
    } as ReturnType<typeof useAccount>);

    render(
      <BulkArchiveCards
        emailGroups={[
          { address: "sender@example.com", name: null, category: null },
        ]}
        categories={[]}
        bulkAction="archive"
      />,
    );

    expect(useThreads).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("sender@example.com"));

    expect(useThreads).toHaveBeenCalledWith({
      fromEmail: "sender@example.com",
      limit: 5,
      type: "inbox",
    });
  });
});
