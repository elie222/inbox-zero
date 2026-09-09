// @vitest-environment jsdom

import { act, render, waitFor } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ASSISTANT_CHAT_MAX_TEXT_LENGTH } from "@/utils/actions/assistant-chat.validation";
import type { MessageContext } from "@/utils/ai/assistant/chat-context-validation";
import { ChatProvider, useChat } from "./ChatProvider";

const {
  mockClientLoggerError,
  mockClientLoggerFlush,
  mockClientLoggerWarn,
  mockSetMessages,
  mockSetQueryState,
  mockSendMessage,
  mockToastError,
  mockUseChatMessages,
  mockUseSWRConfig,
  mockConvertToUIMessages,
  mockCaptureException,
  accountState,
  queryState,
} = vi.hoisted(() => ({
  mockClientLoggerError: vi.fn(),
  mockClientLoggerFlush: vi.fn(),
  mockClientLoggerWarn: vi.fn(),
  mockSetMessages: vi.fn(),
  mockSetQueryState: vi.fn(),
  mockSendMessage: vi.fn(),
  mockToastError: vi.fn(),
  mockUseChatMessages: vi.fn(),
  mockUseSWRConfig: vi.fn(),
  mockConvertToUIMessages: vi.fn(),
  mockCaptureException: vi.fn(),
  accountState: {
    emailAccountId: "account-a",
  },
  queryState: {
    initialChatId: "chat-from-account-a" as string | null,
  },
}));

vi.mock("@ai-sdk/react", () => ({
  useChat: (options: { onError?: (error: Error) => void }) => ({
    id: "new-chat-id",
    messages: [],
    status: "ready",
    setMessages: mockSetMessages,
    sendMessage: (message: unknown, requestOptions?: { body?: unknown }) =>
      mockSendMessage(message, requestOptions).catch((error) => {
        options.onError?.(error);
        throw error;
      }),
    stop: vi.fn(),
    regenerate: vi.fn(),
  }),
}));

vi.mock("ai", () => ({
  DefaultChatTransport: class DefaultChatTransport {},
}));

vi.mock("nuqs", async () => {
  const React = await vi.importActual<typeof import("react")>("react");

  return {
    parseAsString: {},
    useQueryState: () => {
      const [value, setValue] = React.useState<string | null>(
        queryState.initialChatId,
      );

      return [
        value,
        (nextValue: string | null) => {
          mockSetQueryState(nextValue);
          setValue(nextValue);
        },
      ] as const;
    },
  };
});

vi.mock("swr", () => ({
  useSWRConfig: () => mockUseSWRConfig(),
}));

vi.mock("@/hooks/useChatMessages", () => ({
  useChatMessages: (chatId: string | null) => mockUseChatMessages(chatId),
}));

vi.mock("@/providers/EmailAccountProvider", () => ({
  useAccount: () => ({
    emailAccountId: accountState.emailAccountId,
  }),
}));

vi.mock("@/components/assistant-chat/helpers", () => ({
  convertToUIMessages: mockConvertToUIMessages,
}));

vi.mock("@/utils/error", () => ({
  captureException: mockCaptureException,
}));

vi.mock("@/components/Toast", () => ({
  toastError: mockToastError,
}));

vi.mock("@/utils/logger-client", () => ({
  createClientLogger: () => ({
    error: mockClientLoggerError,
    flush: mockClientLoggerFlush,
    warn: mockClientLoggerWarn,
  }),
}));

describe("ChatProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    accountState.emailAccountId = "account-a";
    queryState.initialChatId = "chat-from-account-a";
    mockUseSWRConfig.mockReturnValue({ mutate: vi.fn() });
    mockUseChatMessages.mockImplementation((chatId: string | null) =>
      chatId
        ? {
            data: {
              messages: [
                {
                  id: "message-from-account-a",
                  role: "user",
                  parts: [{ type: "text", text: "Old chat" }],
                },
              ],
            },
          }
        : { data: undefined },
    );
    mockConvertToUIMessages.mockReturnValue([
      {
        id: "message-from-account-a",
        role: "user",
        parts: [{ type: "text", text: "Old chat" }],
      },
    ]);
    mockClientLoggerFlush.mockResolvedValue(undefined);
    mockSendMessage.mockResolvedValue(undefined);
  });

  it("uses attached fix context only for the next message", async () => {
    const fixContext = buildFixRuleContext("first-thread");
    let latestContext: ReturnType<typeof useChat> | undefined;

    function Consumer() {
      latestContext = useChat();
      return null;
    }

    renderWithProvider(<Consumer />);

    act(() => {
      latestContext?.setContext(fixContext);
    });
    await waitFor(() => {
      expect(latestContext?.context).toEqual(fixContext);
    });

    await act(async () => {
      await latestContext?.submitTextMessage("Fix this rule");
    });

    expect(mockSendMessage.mock.calls[0]?.[1]).toEqual({
      body: { context: fixContext },
    });
    expect(latestContext?.context).toBeNull();

    await act(async () => {
      await latestContext?.submitTextMessage("Now answer a new question");
    });

    expect(mockSendMessage.mock.calls[1]?.[1]).toBeUndefined();
  });

  it("restores consumed fix context when sending fails", async () => {
    const fixContext = buildFixRuleContext("failed-thread");
    mockSendMessage.mockRejectedValueOnce(new Error("Network request failed"));
    let latestContext: ReturnType<typeof useChat> | undefined;

    function Consumer() {
      latestContext = useChat();
      return null;
    }

    renderWithProvider(<Consumer />);

    act(() => {
      latestContext?.setContext(fixContext);
    });
    await waitFor(() => {
      expect(latestContext?.context).toEqual(fixContext);
    });

    await act(async () => {
      await expect(
        latestContext?.submitTextMessage("Fix this rule"),
      ).rejects.toThrow("Network request failed");
    });

    expect(mockSendMessage.mock.calls[0]?.[1]).toEqual({
      body: { context: fixContext },
    });
    expect(latestContext?.context).toEqual(fixContext);
  });

  it("clears the active chat when the selected email account changes", async () => {
    let latestContext: ReturnType<typeof useChat> | undefined;

    function Consumer() {
      latestContext = useChat();
      return null;
    }

    const { rerender } = renderWithProvider(<Consumer />);

    await waitFor(() => {
      expect(latestContext?.chatId).toBe("chat-from-account-a");
    });

    accountState.emailAccountId = "account-b";
    rerender(
      <ChatProvider>
        <Consumer />
      </ChatProvider>,
    );

    await waitFor(() => {
      expect(latestContext?.chatId).toBeNull();
    });
    expect(mockSetQueryState).toHaveBeenCalledWith(null);
    expect(mockSetMessages).toHaveBeenLastCalledWith([]);
  });

  it("retains the draft and records safe metadata when sending fails", async () => {
    const draft = "Keep this draft if the request fails";
    const error = new Error("Network request failed");
    mockSendMessage.mockRejectedValueOnce(error);

    let latestContext: ReturnType<typeof useChat> | undefined;

    function Consumer() {
      latestContext = useChat();
      return null;
    }

    renderWithProvider(<Consumer />);

    act(() => {
      latestContext?.setInput(draft);
    });
    await waitFor(() => {
      expect(latestContext?.input).toBe(draft);
    });

    act(() => {
      latestContext?.handleSubmit();
    });

    await waitFor(() => {
      expect(latestContext?.input).toBe(draft);
    });
    expect(mockClientLoggerError).toHaveBeenCalledWith(
      "Assistant chat request failed",
      expect.objectContaining({
        attachmentCount: 0,
        emailAccountId: "account-a",
        failureCategory: "request_error",
        textLength: draft.length,
      }),
    );
    expect(JSON.stringify(mockClientLoggerError.mock.calls)).not.toContain(
      draft,
    );
    expect(mockToastError).toHaveBeenCalledWith({
      description: "We couldn't send your message. Please try again.",
    });
    expect(mockCaptureException).toHaveBeenCalledWith(error);
  });

  it("rejects oversized drafts before sending and keeps their content", async () => {
    const draft = "a".repeat(ASSISTANT_CHAT_MAX_TEXT_LENGTH + 1);
    let latestContext: ReturnType<typeof useChat> | undefined;

    function Consumer() {
      latestContext = useChat();
      return null;
    }

    renderWithProvider(<Consumer />);

    act(() => {
      latestContext?.setInput(draft);
    });
    await waitFor(() => {
      expect(latestContext?.input).toBe(draft);
    });

    act(() => {
      latestContext?.handleSubmit();
    });

    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(latestContext?.input).toBe(draft);
    expect(mockToastError).toHaveBeenCalledWith({
      description: "Messages can be up to 20,000 characters.",
    });
    expect(mockClientLoggerWarn).toHaveBeenCalledWith(
      "Assistant chat input rejected",
      expect.objectContaining({
        emailAccountId: "account-a",
        failureCategory: "message_too_long",
        maxTextLength: ASSISTANT_CHAT_MAX_TEXT_LENGTH,
        textLength: draft.length,
      }),
    );
    expect(JSON.stringify(mockClientLoggerWarn.mock.calls)).not.toContain(
      draft,
    );
  });
});

function renderWithProvider(children: React.ReactNode) {
  return render(<ChatProvider>{children}</ChatProvider>);
}

function buildFixRuleContext(threadId: string): MessageContext {
  return {
    type: "fix-rule",
    message: {
      id: `message-${threadId}`,
      threadId,
      snippet: "Example message",
      textPlain: "Example message body",
      headers: {
        from: "sender@example.com",
        to: "recipient@example.com",
        subject: "Example subject",
        date: "2026-07-31T10:00:00.000Z",
      },
    },
    results: [],
    expected: "none",
  };
}
