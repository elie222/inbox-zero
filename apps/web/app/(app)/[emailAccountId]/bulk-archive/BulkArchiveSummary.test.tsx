// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BulkArchiveSummary,
  formatUpdatedAgo,
} from "@/app/(app)/[emailAccountId]/bulk-archive/BulkArchiveSummary";

describe("formatUpdatedAgo", () => {
  it.each([
    [0, "just now"],
    [59_000, "just now"],
    [60_000, "1 min ago"],
    [59 * 60_000, "59 min ago"],
    [60 * 60_000, "1 hr ago"],
    [26 * 60 * 60_000, "1 day ago"],
  ])("formats %i ms as %s", (elapsed, expected) => {
    expect(formatUpdatedAgo(elapsed)).toBe(expected);
  });
});

describe("BulkArchiveSummary", () => {
  afterEach(cleanup);

  it("gives the number its unit and the unread count before anything is archived", () => {
    render(
      <BulkArchiveSummary
        inboxCount={526}
        unreadCount={98}
        archivedCount={0}
        isRefreshing={false}
        onRefresh={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/emails in your inbox from these senders/).textContent,
    ).toBe("emails in your inbox from these senders · 98 unread");
    expect(screen.queryByText(/archived just now/)).toBeNull();
  });

  it("shows the change and what was archived", () => {
    render(
      <BulkArchiveSummary
        inboxCount={415}
        unreadCount={60}
        baselineCount={526}
        archivedCount={111}
        isRefreshing={false}
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getByText(/archived just now/).textContent).toBe(
      "526 → 415 · 111 archived just now",
    );
  });

  it("disables Refresh while it is fetching", () => {
    render(
      <BulkArchiveSummary
        inboxCount={1}
        unreadCount={0}
        archivedCount={0}
        isRefreshing
        onRefresh={vi.fn()}
      />,
    );

    const button = screen.getByRole("button", {
      name: "Refreshing…",
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
  });
});
