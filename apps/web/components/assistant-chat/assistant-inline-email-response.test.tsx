/** @vitest-environment jsdom */

import React, { createElement, type ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssistantInlineEmailResponse } from "@/components/assistant-chat/assistant-inline-email-response";
import { getEmailUrlForMessage } from "@/utils/url";

const mockUseAccount = vi.fn();
const mockUseEmailLookup = vi.fn();
const mockUseThread = vi.fn();

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
  useThread: (...args: unknown[]) => mockUseThread(...args),
}));

afterEach(() => {
  cleanup();
});

describe("AssistantInlineEmailResponse", () => {
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

    mockUseThread.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    });
  });

  it("renders inline email cards", () => {
    render(
      createElement(
        AssistantInlineEmailResponse,
        null,
        '\n<emails>\n<email threadid="thread-1" action="none">Review</email>\n</emails>\n',
      ),
    );

    expect(screen.getByRole("link").getAttribute("href")).toBe(
      getEmailUrlForMessage(
        "msg-thread-1",
        "thread-1",
        "user@example.com",
        "google",
      ),
    );
    expect(screen.getByRole("button", { name: "Archive" })).toBeTruthy();
  });

  it("renders inline email detail views", () => {
    mockUseThread.mockReturnValue({
      data: {
        thread: {
          id: "thread-1",
          messages: [
            {
              id: "message-1",
              threadId: "thread-1",
              subject: "Rendered detail subject",
              snippet: "Rendered detail snippet",
              date: "2026-03-11T11:00:00.000Z",
              historyId: "history-1",
              inline: [],
              headers: {
                from: "Sender <sender@example.com>",
                to: "user@example.com",
                date: "2026-03-11T11:00:00.000Z",
                subject: "Rendered detail subject",
              },
              textPlain: "Rendered detail body",
            },
          ],
        },
      },
      isLoading: false,
      error: null,
    });

    render(
      createElement(
        AssistantInlineEmailResponse,
        null,
        '\n<email-detail threadid="thread-1">Focus on the action item.</email-detail>\n',
      ),
    );

    expect(screen.getByText("Subject")).toBeTruthy();
    expect(screen.getByText("Focus on the action item.")).toBeTruthy();
    expect(screen.getByText("Rendered detail body")).toBeTruthy();
    expect(screen.getByRole("link").getAttribute("href")).toBe(
      getEmailUrlForMessage(
        "msg-thread-1",
        "thread-1",
        "user@example.com",
        "google",
      ),
    );
  });
});
