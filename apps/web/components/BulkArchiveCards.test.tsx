// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BulkArchiveCards } from "@/components/BulkArchiveCards";
import { useThreads } from "@/hooks/useThreads";
import { useAccount } from "@/providers/EmailAccountProvider";
import { addToDeleteSenderQueue } from "@/store/delete-sender-queue";

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

  it("deletes only the senders still selected after one is deselected", async () => {
    vi.mocked(useAccount).mockReturnValue({
      emailAccountId: "account-1",
      userEmail: "user@example.com",
      provider: "google",
    } as ReturnType<typeof useAccount>);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <BulkArchiveCards
        emailGroups={[
          { address: "keep@example.com", name: null, category: null },
          { address: "remove@example.com", name: null, category: null },
        ]}
        categories={[]}
        bulkAction="delete"
      />,
    );

    const keepCheckbox = screen.getByRole("checkbox", {
      name: "Select keep@example.com",
    });
    fireEvent.click(keepCheckbox);
    expect(keepCheckbox.getAttribute("aria-checked")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "Delete 1 of 2" }));

    await vi.waitFor(() =>
      expect(addToDeleteSenderQueue).toHaveBeenCalledTimes(1),
    );
    expect(addToDeleteSenderQueue).toHaveBeenCalledWith({
      sender: "remove@example.com",
      emailAccountId: "account-1",
    });
  });
});
