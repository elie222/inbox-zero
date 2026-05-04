/** @vitest-environment jsdom */

import React, { createElement, type ReactNode } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssistantInlineEmailResponse } from "@/components/assistant-chat/assistant-inline-email-response";
import { getEmailUrlForMessage } from "@/utils/url";

const mockUseAccount = vi.fn();
const mockUseEmailLookup = vi.fn();
const mockUseThread = vi.fn();
const mockSubmitTextMessage = vi.fn();

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
  Button: ({
    children,
    ...props
  }: {
    children?: ReactNode;
  } & React.ButtonHTMLAttributes<HTMLButtonElement>) =>
    createElement("button", { type: "button", ...props }, children || "button"),
}));

vi.mock("@/utils/actions/mail", () => ({
  archiveThreadAction: vi.fn(),
  markReadThreadAction: vi.fn(),
}));

vi.mock("@/providers/ChatProvider", () => ({
  useChat: () => ({
    submitTextMessage: mockSubmitTextMessage,
  }),
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

    mockSubmitTextMessage.mockResolvedValue(undefined);
  });

  it("renders inline email cards", async () => {
    render(
      createElement(
        AssistantInlineEmailResponse,
        null,
        '\n<emails>\n<email threadid="thread-1" action="none">Review</email>\n</emails>\n',
      ),
    );

    openMoreActions();

    expect((await screen.findByText("Open in email")).closest("a")?.href).toBe(
      getEmailUrlForMessage(
        "msg-thread-1",
        "thread-1",
        "user@example.com",
        "google",
      ),
    );
    expect(screen.getByText("Archive")).toBeTruthy();
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

  it("renders inline rule suggestions and can ask chat to create one", async () => {
    render(
      createElement(
        AssistantInlineEmailResponse,
        null,
        [
          "\n<rule-suggestions>\n",
          '<rule-suggestion name="Monitoring" when="mention alerts from monitoring tools" label="Monitoring" archive="true" />\n',
          "</rule-suggestions>\n",
        ].join(""),
      ),
    );

    expect(screen.getByText("Monitoring")).toBeTruthy();
    expect(
      screen.getByText("mention alerts from monitoring tools"),
    ).toBeTruthy();
    expect(screen.getByText("Label as 'Monitoring'")).toBeTruthy();
    expect(screen.getByText("Archive")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Approve/i }));

    await waitFor(() => {
      expect(mockSubmitTextMessage).toHaveBeenCalledWith(
        expect.stringContaining("Create this suggested rule: Monitoring"),
      );
    });
  });

  it("renders free-form rule suggestion actions as plain text", () => {
    render(
      createElement(
        AssistantInlineEmailResponse,
        null,
        '<rule-suggestion name="Monitoring" when="mention alerts" do="label the email as Monitoring and archive" />',
      ),
    );

    expect(
      screen.getByText("label the email as Monitoring and archive"),
    ).toBeTruthy();
    expect(screen.queryByText("Label as 'the email as'")).toBeNull();
  });

  it("renders specific notification destinations in rule suggestions", () => {
    render(
      createElement(
        AssistantInlineEmailResponse,
        null,
        '<rule-suggestion name="Support" when="support requests" label="Support" notify="Slack" />',
      ),
    );

    expect(screen.getByText("Label as 'Support'")).toBeTruthy();
    expect(screen.getByText("Notify via Slack")).toBeTruthy();
    expect(screen.queryByText("Notify via chat app")).toBeNull();
  });

  it("renders structured draft and mark-read actions in rule suggestions", () => {
    render(
      createElement(
        AssistantInlineEmailResponse,
        null,
        '<rule-suggestion name="Updates" when="low-priority updates" draft="true" markread="true" />',
      ),
    );

    expect(screen.getByText("Draft Reply")).toBeTruthy();
    expect(screen.getByText("Mark Read")).toBeTruthy();
  });
});

function openMoreActions() {
  fireEvent.pointerDown(screen.getByRole("button", { name: "More actions" }), {
    button: 0,
    ctrlKey: false,
  });
}
