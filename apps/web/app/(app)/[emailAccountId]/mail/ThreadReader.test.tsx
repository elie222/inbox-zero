// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThreadReader } from "@/app/(app)/[emailAccountId]/mail/ThreadReader";
import type { ThreadMessage } from "@/components/email-list/types";
import { hideSendingDraftMessages } from "@/hooks/useHiddenDraftMessageIds";

vi.mock("@/env", () => ({
  env: { NEXT_PUBLIC_SUPPORT_EMAIL: "support@example.com" },
}));
vi.mock("@/providers/EmailAccountProvider", () => ({
  useAccount: () => ({ emailAccountId: "account-1" }),
}));
vi.mock("@/app/(app)/[emailAccountId]/mail/ReaderToolbar", () => ({
  ReaderToolbar: ({ subject }: { subject: string }) => <h1>{subject}</h1>,
}));
vi.mock("@/components/email-list/EmailThread", () => ({
  EmailThread: ({ renderToolbar }: { renderToolbar: () => ReactNode }) =>
    renderToolbar(),
}));
vi.mock("@/components/team-comments/PublisherDiscussion", () => ({
  PublisherDiscussion: () => null,
}));

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

(globalThis as { ResizeObserver?: typeof MockResizeObserver }).ResizeObserver =
  MockResizeObserver;

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

  it("titles the thread from its shown messages, not a draft hidden for a pending send", () => {
    const showDraftAgain = hideSendingDraftMessages("account-1", ["draft-1"]);
    try {
      renderReader({
        refetch: vi.fn(),
        messages: [
          createMessage("message-1", "Quarterly plan", ["INBOX"]),
          createMessage("draft-1", "Re: Quarterly plan", ["DRAFT"]),
        ],
      });

      expect(
        screen.getByRole("heading", { name: "Quarterly plan" }),
      ).toBeTruthy();
    } finally {
      showDraftAgain();
    }
  });
});

function renderReader({
  error,
  refetch,
  messages = [],
}: {
  error?: Parameters<typeof ThreadReader>[0]["error"];
  refetch: () => void;
  messages?: ThreadMessage[];
}) {
  return render(
    <ThreadReader
      detailSelectionSettled
      enableMessageNavigation={false}
      error={error}
      labelHref={() => "/labels"}
      layout="split"
      loading={false}
      messages={messages}
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

function createMessage(id: string, subject: string, labelIds: string[]) {
  return {
    id,
    threadId: "thread-1",
    labelIds,
    headers: { subject, from: "sender@example.com", date: "" },
  } as unknown as ThreadMessage;
}
