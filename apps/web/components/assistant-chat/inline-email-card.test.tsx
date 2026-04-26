/** @vitest-environment jsdom */

import React, { createElement, type MouseEvent, type ReactNode } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  InlineEmailCard,
  InlineEmailList,
} from "@/components/assistant-chat/inline-email-card";
import { getEmailUrlForMessage } from "@/utils/url";

(globalThis as { React?: typeof React }).React = React;

const mockUseAccount = vi.fn();
const mockUseEmailLookup = vi.fn();
const mockArchiveThreadAction = vi.fn();
const mockMarkReadThreadAction = vi.fn();
const mockUseThread = vi.fn();
const mockQueueAction = vi.fn();

vi.mock("@/providers/EmailAccountProvider", () => ({
  useAccount: () => mockUseAccount(),
}));

vi.mock("@/components/assistant-chat/email-lookup-context", () => ({
  useEmailLookup: () => mockUseEmailLookup(),
}));

vi.mock("@/components/assistant-chat/inline-email-action-context", () => ({
  useInlineEmailActionContext: () => ({
    queueAction: (...args: unknown[]) => mockQueueAction(...args),
  }),
}));

vi.mock("@/utils/actions/mail", () => ({
  archiveThreadAction: (...args: unknown[]) => mockArchiveThreadAction(...args),
  markReadThreadAction: (...args: unknown[]) =>
    mockMarkReadThreadAction(...args),
}));

vi.mock("@/components/Toast", () => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/components/Tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children?: ReactNode;
    onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
    disabled?: boolean;
  }) =>
    createElement(
      "button",
      { type: "button", onClick, disabled },
      children || "icon-button",
    ),
}));

vi.mock("@/hooks/useThread", () => ({
  useThread: (...args: unknown[]) => mockUseThread(...args),
}));

vi.mock("@/components/email-list/EmailDetails", () => ({
  EmailDetails: ({
    message,
  }: {
    message: { headers?: { from?: string; to?: string } };
  }) => (
    <div>
      {message.headers?.from ? (
        <>
          <span>From:</span>
          <span>{message.headers.from}</span>
        </>
      ) : null}
      {message.headers?.to ? (
        <>
          <span>To:</span>
          <span>{message.headers.to}</span>
        </>
      ) : null}
    </div>
  ),
}));

vi.mock("@/components/email-list/EmailContents", () => ({
  HtmlEmail: ({ html }: { html: string }) => (
    <iframe title="Email content preview" srcDoc={html} />
  ),
  PlainEmail: ({ text }: { text: string }) => <pre>{text}</pre>,
}));

vi.mock("@/components/email-list/EmailAttachments", () => ({
  EmailAttachments: () => <div>Attachments</div>,
}));

afterEach(() => {
  cleanup();
});

describe("InlineEmailCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseAccount.mockReturnValue({
      emailAccountId: "account-1",
      provider: "google",
      userEmail: "user@example.com",
    });

    mockUseEmailLookup.mockReturnValue(
      new Map([
        [
          "19cdca06580b38e9",
          {
            messageId: "msg-1",
            from: "Sender One",
            subject: "Subject One",
            snippet: "Snippet One",
            date: "2026-03-11T10:00:00.000Z",
            isUnread: true,
          },
        ],
        [
          "thread-1",
          {
            messageId: "msg-thread-1",
            from: "Sender Two",
            subject: "Subject Two",
            snippet: "Snippet Two",
            date: "2026-03-11T11:00:00.000Z",
            isUnread: false,
          },
        ],
        [
          "thread-2",
          {
            messageId: "msg-thread-2",
            from: "Sender Three",
            subject: "Subject Three",
            snippet: "Snippet Three",
            date: "2026-03-11T12:00:00.000Z",
            isUnread: false,
          },
        ],
      ]),
    );

    mockArchiveThreadAction.mockResolvedValue({});
    mockMarkReadThreadAction.mockResolvedValue({});
    mockQueueAction.mockReset();
    mockUseThread.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    });
  });

  it("normalizes legacy prefixed ids for the Gmail link and archive action", async () => {
    render(
      createElement(
        InlineEmailCard,
        { id: "user-content-19cdca06580b38e9", action: "archive" },
        "Follow up",
      ),
    );

    expect(screen.getByRole("link").getAttribute("href")).toBe(
      getEmailUrlForMessage(
        "msg-1",
        "19cdca06580b38e9",
        "user@example.com",
        "google",
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));

    await waitFor(() => {
      expect(mockArchiveThreadAction).toHaveBeenCalledWith("account-1", {
        threadId: "19cdca06580b38e9",
      });
    });

    expect(mockQueueAction).toHaveBeenCalledWith("archive_threads", [
      "19cdca06580b38e9",
    ]);
  });

  it("renders the app email preview when expanded", () => {
    mockUseThread.mockReturnValue({
      data: {
        thread: {
          id: "thread-1",
          messages: [
            {
              id: "message-1",
              threadId: "thread-1",
              subject: "Rendered Subject",
              snippet: "Rendered snippet",
              date: "2026-03-11T11:00:00.000Z",
              historyId: "history-1",
              inline: [],
              headers: {
                from: "Sender Two <sender-two@example.com>",
                to: "user@example.com",
                date: "2026-03-11T11:00:00.000Z",
                subject: "Rendered Subject",
              },
              textPlain: "Rendered plain body",
            },
          ],
        },
      },
      isLoading: false,
      error: null,
    });

    render(
      <InlineEmailCard threadid="thread-1" action="none">
        Second
      </InlineEmailCard>,
    );

    fireEvent.click(screen.getByText("Subject Two"));

    expect(screen.getByText("Rendered Subject")).toBeTruthy();
    expect(screen.getByText("From:")).toBeTruthy();
    expect(
      screen.getByText("Sender Two <sender-two@example.com>"),
    ).toBeTruthy();
    expect(screen.getByText("Rendered plain body")).toBeTruthy();
  });

  it("shows the archive action even when action is none", () => {
    render(
      <InlineEmailCard threadid="thread-1" action="none">
        Second
      </InlineEmailCard>,
    );

    expect(screen.getByRole("button", { name: "Archive" })).toBeTruthy();
  });

  it("renders the preview when message headers are missing", () => {
    mockUseThread.mockReturnValue({
      data: {
        thread: {
          id: "thread-1",
          messages: [
            {
              id: "message-1",
              threadId: "thread-1",
              subject: "Fallback Subject",
              snippet: "Fallback snippet",
              date: "2026-03-11T11:00:00.000Z",
              historyId: "history-1",
              inline: [],
              textPlain: "Fallback body",
            },
          ],
        },
      },
      isLoading: false,
      error: null,
    });

    render(
      <InlineEmailCard threadid="thread-1" action="none">
        Second
      </InlineEmailCard>,
    );

    fireEvent.click(screen.getByText("Subject Two"));

    expect(screen.getByText("Fallback Subject")).toBeTruthy();
    expect(screen.getByText("Fallback body")).toBeTruthy();
  });
});

describe("InlineEmailList", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseAccount.mockReturnValue({
      emailAccountId: "account-1",
      provider: "google",
      userEmail: "user@example.com",
    });

    mockUseEmailLookup.mockReturnValue(new Map());
    mockArchiveThreadAction.mockResolvedValue({});
    mockMarkReadThreadAction.mockResolvedValue({});
    mockQueueAction.mockReset();
    mockUseThread.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    });
  });

  it("archives all cards using the dedicated threadid attribute", async () => {
    render(
      createElement(
        InlineEmailList,
        null,
        createElement(
          InlineEmailCard,
          { threadid: "thread-1", action: "none" },
          "First",
        ),
        createElement(
          InlineEmailCard,
          { threadid: "thread-2", action: "none" },
          "Second",
        ),
      ),
    );

    fireEvent.click(screen.getAllByRole("button")[0]);

    await waitFor(() => {
      expect(mockArchiveThreadAction).toHaveBeenCalledTimes(2);
    });

    expect(mockArchiveThreadAction).toHaveBeenNthCalledWith(1, "account-1", {
      threadId: "thread-1",
    });
    expect(mockArchiveThreadAction).toHaveBeenNthCalledWith(2, "account-1", {
      threadId: "thread-2",
    });
    expect(mockQueueAction).toHaveBeenCalledWith("archive_threads", [
      "thread-1",
      "thread-2",
    ]);
  });

  it("updates each row inline after archive all succeeds", async () => {
    render(
      <InlineEmailList>
        <InlineEmailCard threadid="thread-1">First</InlineEmailCard>
        <InlineEmailCard threadid="thread-2">Second</InlineEmailCard>
      </InlineEmailList>,
    );

    fireEvent.click(screen.getAllByRole("button")[0]);

    await waitFor(() => {
      expect(screen.getAllByText("Archived").length).toBe(2);
    });
  });

  it("collapses fully archived sections into a compact summary", async () => {
    vi.useFakeTimers();

    try {
      render(
        <InlineEmailList>
          <InlineEmailCard threadid="thread-1">First</InlineEmailCard>
          <InlineEmailCard threadid="thread-2">Second</InlineEmailCard>
        </InlineEmailList>,
      );

      fireEvent.click(screen.getAllByRole("button")[0]);

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(mockQueueAction).toHaveBeenCalledWith("archive_threads", [
        "thread-1",
        "thread-2",
      ]);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(800);
      });

      expect(screen.getByText("Completed emails")).toBeTruthy();
      expect(screen.getByText("2 archived")).toBeTruthy();
      expect(screen.queryByText("First")).toBeNull();
      expect(screen.queryByText("Second")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("collapses fully marked-read sections into a compact summary", async () => {
    vi.useFakeTimers();

    try {
      render(
        <InlineEmailList>
          <InlineEmailCard threadid="thread-1">First</InlineEmailCard>
          <InlineEmailCard threadid="thread-2">Second</InlineEmailCard>
        </InlineEmailList>,
      );

      fireEvent.click(screen.getAllByRole("button")[1]);

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(mockQueueAction).toHaveBeenCalledWith("mark_read_threads", [
        "thread-1",
        "thread-2",
      ]);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(800);
      });

      expect(screen.getByText("Completed emails")).toBeTruthy();
      expect(screen.getByText("2 marked read")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});
