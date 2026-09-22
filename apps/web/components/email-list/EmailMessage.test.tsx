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

const mocks = vi.hoisted(() => ({
  executeAsync: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("next-safe-action/hooks", () => ({
  useAction: () => ({ executeAsync: mocks.executeAsync }),
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
vi.mock("@/components/Toast", () => ({ toastError: mocks.toastError }));
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
    replyingToEmail?: {
      to?: string;
      threadId?: string;
      forwardedMessageId?: string;
      forwardedAttachments?: Array<{ filename: string }>;
    };
  }) => (
    <div
      data-testid="composer"
      data-inline-reply="true"
      data-thread-id={replyingToEmail?.threadId}
      data-forwarded-message-id={replyingToEmail?.forwardedMessageId}
      data-forwarded-attachments={replyingToEmail?.forwardedAttachments
        ?.map((attachment) => attachment.filename)
        .join(",")}
    >
      <span>{replyingToEmail?.to ? "reply" : "forward"}</span>
      <textarea aria-label="Email message" />
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

  it("returns focus to the message when Escape is pressed in a provider draft", () => {
    render(
      <EmailMessage
        draftMessages={[createMessage("draft-1")]}
        expanded
        message={createMessage("message-1")}
        onSendSuccess={vi.fn()}
        refetch={vi.fn()}
        showReplyButton
      />,
    );

    const editor = screen.getByRole("textbox", { name: "Email message" });
    editor.focus();
    expect(document.activeElement).toBe(editor);

    fireEvent.keyDown(editor, { key: "Escape" });

    expect(document.activeElement).toBe(screen.getByRole("listitem"));
    expect(screen.getByTestId("composer")).toBeTruthy();
  });

  it("restores a provider draft when discard returns an empty server error", async () => {
    let resolveDiscard: (result: { serverError: string }) => void = () => {};
    mocks.executeAsync.mockReturnValue(
      new Promise((resolve) => {
        resolveDiscard = resolve;
      }),
    );
    const refetch = vi.fn();

    render(
      <EmailMessage
        draftMessages={[createMessage("draft-1")]}
        expanded
        message={createMessage("message-1")}
        onSendSuccess={vi.fn()}
        refetch={refetch}
        showReplyButton
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Discard draft" }));
    expect(screen.queryByTestId("composer")).toBeNull();

    await act(async () => {
      resolveDiscard({ serverError: "" });
    });

    expect(screen.getByTestId("composer")).toBeTruthy();
    expect(mocks.toastError).toHaveBeenCalledWith({
      description: "Failed to discard draft",
    });
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("keeps a newer compose mode open when an earlier discard fails", async () => {
    let rejectDiscard: (error: Error) => void = () => {};
    mocks.executeAsync.mockReturnValue(
      new Promise((_, reject) => {
        rejectDiscard = reject;
      }),
    );
    const refetch = vi.fn();

    render(
      <EmailMessage
        draftMessages={[createMessage("draft-1")]}
        expanded
        message={createMessage("message-1")}
        onSendSuccess={vi.fn()}
        refetch={refetch}
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

    expect(
      screen.getAllByTestId("composer").map((composer) => composer.textContent),
    ).toEqual(["replyDiscard draft", "forwardDiscard draft"]);
    expect(mocks.toastError).toHaveBeenCalledWith({
      description: "Failed to discard draft",
    });
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe("EmailMessage forward", () => {
  afterEach(cleanup);

  it.each([
    "button",
    "default",
  ] as const)("waits for the body before forwarding through %s", (entry) => {
    const refetch = vi.fn();
    const props = {
      expanded: true,
      message: createMessage("message-1"),
      onSendSuccess: vi.fn(),
      refetch,
      showReplyButton: true,
      defaultComposeMode:
        entry === "default" ? ("forward" as const) : undefined,
    };
    const { rerender } = render(
      <EmailMessage {...props} bodyAvailable={false} />,
    );
    if (entry === "button")
      fireEvent.click(screen.getByRole("button", { name: "Forward" }));
    expect(screen.queryByTestId("composer")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Load message to forward" }),
    );
    expect(refetch).toHaveBeenCalledOnce();
    rerender(<EmailMessage {...props} bodyAvailable />);
    expect(screen.getByTestId("composer").dataset.forwardedMessageId).toBe(
      "message-1",
    );
    expect(screen.getByTestId("composer").dataset.forwardedAttachments).toBe(
      "report.pdf",
    );
  });

  it("preserves an open unsent forward when the reader falls back to metadata", () => {
    const props = {
      expanded: true,
      message: createMessage("message-1"),
      onSendSuccess: vi.fn(),
      refetch: vi.fn(),
      showReplyButton: true,
      defaultComposeMode: "forward" as const,
    };
    const { rerender } = render(<EmailMessage {...props} />);
    const editor = screen.getByRole("textbox", {
      name: "Email message",
    }) as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: "Unsent draft content" } });
    rerender(
      <EmailMessage
        {...props}
        bodyAvailable={false}
        message={{
          ...props.message,
          attachments: undefined,
          textHtml: undefined,
          textPlain: undefined,
        }}
      />,
    );
    expect(screen.getByRole("textbox", { name: "Email message" })).toBe(editor);
    expect(editor.value).toBe("Unsent draft content");
    expect(screen.getByTestId("composer").dataset.forwardedAttachments).toBe(
      "report.pdf",
    );
  });

  it("composes the forward against the thread it came from", () => {
    render(
      <EmailMessage
        expanded
        message={createMessage("message-1")}
        onSendSuccess={vi.fn()}
        refetch={vi.fn()}
        showReplyButton
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Forward" }));

    const composer = screen.getByTestId("composer");
    expect(composer.dataset.threadId).toBe("thread-1");
    // Outlook needs the source message to keep the forward in its conversation.
    expect(composer.dataset.forwardedMessageId).toBe("message-1");
    // The files travel with the forward, so the composer has to show them.
    expect(composer.dataset.forwardedAttachments).toBe("report.pdf");
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
    attachments: [
      {
        attachmentId: "attachment-1",
        filename: "report.pdf",
        mimeType: "application/pdf",
        size: 1024,
        headers: {
          "content-description": "",
          "content-id": "",
          "content-transfer-encoding": "base64",
        },
      },
    ],
    historyId: "history-1",
    id,
    inline: [],
    snippet: "Preview",
    subject: "Subject",
    textPlain: "Message body",
    threadId: "thread-1",
  } as ThreadMessage;
}
