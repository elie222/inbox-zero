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

  it("shows the number alone before anything is archived", () => {
    render(
      <BulkArchiveSummary
        inboxCount={526}
        archivedCount={0}
        isRefreshing={false}
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getByText("In your inbox from these senders")).toBeTruthy();
    expect(screen.queryByText(/archived just now/)).toBeNull();
  });

  it("notes the earlier number and what was archived", () => {
    render(
      <BulkArchiveSummary
        inboxCount={415}
        baselineCount={526}
        archivedCount={111}
        isRefreshing={false}
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getByText(/archived just now/).textContent).toBe(
      "was 526 · 111 archived just now",
    );
  });

  it("disables Refresh while it is fetching", () => {
    render(
      <BulkArchiveSummary
        inboxCount={1}
        archivedCount={0}
        isRefreshing
        onRefresh={vi.fn()}
      />,
    );

    expect(
      (screen.getByRole("button", { name: "Refresh" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});
