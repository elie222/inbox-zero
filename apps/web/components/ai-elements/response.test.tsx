/** @vitest-environment jsdom */

import React, { createElement, type ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Response } from "@/components/ai-elements/response";

const mockUseAccount = vi.fn();
const mockUseEmailLookup = vi.fn();

(globalThis as { React?: typeof React }).React = React;

vi.mock("@/providers/EmailAccountProvider", () => ({
  useAccount: () => mockUseAccount(),
}));

vi.mock("@/components/assistant-chat/email-lookup-context", () => ({
  useEmailLookup: () => mockUseEmailLookup(),
}));

vi.mock("@/components/Toast", () => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/components/Tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children?: ReactNode }) =>
    createElement("button", { type: "button" }, children || "icon-button"),
}));

vi.mock("@/utils/actions/mail", () => ({
  archiveThreadAction: vi.fn(),
  markReadThreadAction: vi.fn(),
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

describe("Response", () => {
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
          "thread-1",
          {
            messageId: "msg-thread-1",
            from: "Sender",
            subject: "Subject",
            snippet: "Snippet",
            date: "2026-03-11T10:00:00.000Z",
            isUnread: false,
          },
        ],
      ]),
    );
  });

  it("passes the threadid attribute through to inline email cards", () => {
    render(
      createElement(
        Response,
        null,
        '\n<emails>\n<email threadid="thread-1" action="none">Review</email>\n</emails>\n',
      ),
    );

    expect(screen.getByRole("link").getAttribute("href")).toBe(
      "https://mail.google.com/mail/u/user@example.com/#all/msg-thread-1",
    );
    expect(screen.getByRole("button", { name: "Archive" })).toBeTruthy();
  });
});
