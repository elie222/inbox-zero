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

vi.mock("@/utils/mail-engine/thread-mail-mutations", () => ({
  enqueueThreadMailMutationBatch: vi.fn(),
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

  describe("lead button", () => {
    const category = (id: string, name: string) =>
      ({ id, name, description: null, rules: [] }) as never;
    const categories = [
      category("1", "Marketing"),
      category("2", "Newsletter"),
    ];
    const sender = (
      address: string,
      categoryIndex: number,
      read: number,
      total: number,
    ) => ({
      address,
      name: null,
      category: categories[categoryIndex],
      counts: { inbox: 5, unread: 2, read, total },
    });

    beforeEach(() => {
      vi.mocked(useAccount).mockReturnValue({
        emailAccountId: "account-1",
        userEmail: "user@example.com",
        provider: "google",
      } as ReturnType<typeof useAccount>);
    });

    it("keeps one primary button on the rarely read category and asks to review the rest", () => {
      render(
        <BulkArchiveCards
          emailGroups={[
            sender("deals@example.com", 0, 37, 100),
            sender("digest@example.com", 1, 76, 100),
          ]}
          categories={categories}
          bulkAction="archive"
        />,
      );

      expect(
        screen.getAllByRole("button", { name: "Archive all" }),
      ).toHaveLength(1);
      expect(
        screen.getAllByRole("button", { name: "Review First" }),
      ).toHaveLength(4);
      const headings = screen
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent);
      expect(headings.slice(0, 2)).toEqual(["Marketing", "Newsletter"]);
    });

    it("shows inbox and unread counts under the name", () => {
      render(
        <BulkArchiveCards
          emailGroups={[sender("deals@example.com", 0, 37, 100)]}
          categories={categories}
          bulkAction="archive"
        />,
      );

      expect(screen.getAllByText(/in inbox/)[0].closest("p")?.textContent).toBe(
        "5 in inbox · 2 unread",
      );
    });

    it("holds the archived result with an Undo button", () => {
      render(
        <BulkArchiveCards
          emailGroups={[sender("deals@example.com", 0, 37, 100)]}
          categories={categories}
          bulkAction="archive"
          heldArchives={{ Marketing: { count: 5, threads: [] } }}
        />,
      );

      expect(screen.getByText("archived").parentElement?.textContent).toBe(
        "5 archived",
      );
      expect(screen.getByRole("button", { name: "Undo" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Archive all" })).toBeNull();
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
