/** @vitest-environment jsdom */

import type { MouseEvent, ReactNode } from "react";
import {
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

const mockUseAccount = vi.fn();
const mockUseEmailLookup = vi.fn();
const mockArchiveThreadAction = vi.fn();
const mockMarkReadThreadAction = vi.fn();

vi.mock("@/providers/EmailAccountProvider", () => ({
  useAccount: () => mockUseAccount(),
}));

vi.mock("@/components/assistant-chat/email-lookup-context", () => ({
  useEmailLookup: () => mockUseEmailLookup(),
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
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children || "icon-button"}
    </button>
  ),
}));

vi.mock("@/hooks/useThread", () => ({
  useThread: () => ({
    data: undefined,
    isLoading: false,
    error: null,
  }),
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
  });

  it("normalizes legacy prefixed ids for the Gmail link and archive action", async () => {
    render(
      <InlineEmailCard id="user-content-19cdca06580b38e9" action="archive">
        Follow up
      </InlineEmailCard>,
    );

    expect(screen.getByRole("link").getAttribute("href")).toBe(
      "https://mail.google.com/mail/u/user@example.com/#all/msg-1",
    );

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));

    await waitFor(() => {
      expect(mockArchiveThreadAction).toHaveBeenCalledWith("account-1", {
        threadId: "19cdca06580b38e9",
      });
    });
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
  });

  it("archives all cards using the dedicated threadid attribute", async () => {
    render(
      <InlineEmailList>
        <InlineEmailCard threadid="thread-1" action="none">
          First
        </InlineEmailCard>
        <InlineEmailCard threadid="thread-2" action="none">
          Second
        </InlineEmailCard>
      </InlineEmailList>,
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
  });
});
