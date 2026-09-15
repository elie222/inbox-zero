// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThreadReader } from "@/app/(app)/[emailAccountId]/mail/ThreadReader";

vi.mock("@/env", () => ({
  env: { NEXT_PUBLIC_SUPPORT_EMAIL: "support@example.com" },
}));
vi.mock("@/app/(app)/[emailAccountId]/mail/ReaderToolbar", () => ({
  ReaderToolbar: () => null,
}));
vi.mock("@/components/email-list/EmailThread", () => ({
  EmailThread: () => null,
}));

describe("ThreadReader", () => {
  afterEach(cleanup);

  it("explains a thread that failed to load and offers a retry", () => {
    const refetch = vi.fn();

    renderReader({
      error: {
        info: { error: "This conversation isn't available yet." },
        status: 404,
      },
      refetch,
    });

    expect(
      screen.getByText("This conversation isn't available yet."),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

function renderReader({
  error,
  refetch,
}: {
  error: Parameters<typeof ThreadReader>[0]["error"];
  refetch: () => void;
}) {
  return render(
    <ThreadReader
      detailSelectionSettled
      enableMessageNavigation={false}
      error={error}
      labelHref={() => "/labels"}
      layout="split"
      loading={false}
      messages={[]}
      onArchive={vi.fn()}
      isUnread={false}
      onMarkRead={vi.fn()}
      onMarkUnread={vi.fn()}
      onBackToInbox={vi.fn()}
      refetch={refetch}
      thread={null}
      threadId="thread-1"
      userLabels={{}}
    />,
  );
}
