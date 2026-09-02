// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ThreadMessage } from "@/components/email-list/types";
import { EmailMessage } from "@/components/email-list/EmailMessage";

const actions = vi.hoisted(() => ({ executeAsync: vi.fn() }));

vi.mock("next-safe-action/hooks", () => ({
  useAction: () => actions,
}));
vi.mock("swr", () => ({
  default: () => ({ data: undefined }),
}));
vi.mock("@/providers/EmailAccountProvider", () => ({
  useAccount: () => ({
    emailAccount: undefined,
    emailAccountId: "account-1",
    userEmail: "user@example.com",
  }),
}));
vi.mock("@/env", () => ({
  env: { NEXT_PUBLIC_CONTACTS_ENABLED: false },
}));
vi.mock("@/components/Tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/email-list/EmailContents", () => ({
  HtmlEmail: () => null,
  PlainEmail: () => null,
}));
vi.mock("@/components/email-list/EmailAttachments", () => ({
  EmailAttachments: () => null,
}));
vi.mock("@/components/email-list/EmailDetails", () => ({
  EmailDetails: () => null,
}));
vi.mock("@/components/Toast", () => ({ toastError: vi.fn() }));
vi.mock("@/utils/actions/mail", () => ({ deleteDraftAction: vi.fn() }));
vi.mock("@/utils/actions/generate-reply", () => ({
  generateNudgeReplyAction: vi.fn(),
}));
vi.mock("@/app/(app)/[emailAccountId]/compose/ComposeEmailFormLazy", () => ({
  ComposeEmailFormLazy: ({
    onDiscard,
    replyingToEmail,
  }: {
    onDiscard: () => void;
    replyingToEmail?: { to?: string };
  }) => (
    <div data-testid="composer">
      <span>{replyingToEmail?.to ? "reply" : "forward"}</span>
      <button onClick={onDiscard} type="button">
        Discard draft
      </button>
    </div>
  ),
}));

describe("EmailMessage draft recovery", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps a newer compose mode open when an earlier discard fails", async () => {
    let rejectDiscard: (error: Error) => void = () => {};
    actions.executeAsync.mockReturnValue(
      new Promise((_, reject) => {
        rejectDiscard = reject;
      }),
    );

    render(
      <EmailMessage
        defaultShowReply
        draftMessage={createMessage("draft-1")}
        expanded
        message={createMessage("message-1")}
        onSendSuccess={vi.fn()}
        refetch={vi.fn()}
        showReplyButton
      />,
    );

    expect(screen.getByTestId("composer").textContent).toContain("reply");
    fireEvent.click(screen.getByRole("button", { name: "Discard draft" }));
    expect(screen.queryByTestId("composer")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Forward" }));
    expect(screen.getByTestId("composer").textContent).toContain("forward");

    await act(async () => {
      rejectDiscard(new Error("Request failed"));
    });

    expect(screen.getByTestId("composer").textContent).toContain("forward");
  });
});

function createMessage(id: string) {
  return {
    date: "2026-01-01T00:00:00.000Z",
    headers: {
      date: "2026-01-01T00:00:00.000Z",
      from: "sender@example.com",
      subject: "Subject",
      to: "user@example.com",
    },
    historyId: "history-1",
    id,
    inline: [],
    snippet: "Preview",
    subject: "Subject",
    textPlain: "Message body",
    threadId: "thread-1",
  } as ThreadMessage;
}
