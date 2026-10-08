// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ASSISTANT_CHAT_MAX_TEXT_LENGTH } from "@/utils/actions/assistant-chat.validation";
import type { MessageContext } from "@/utils/ai/assistant/chat-context-validation";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";
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
  mockChatStop,
  mockResumeStream,
  accountState,
  chatState,
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
  mockChatStop: vi.fn(),
  mockResumeStream: vi.fn(),
  accountState: {
    emailAccountId: "account-a",
  },
  chatState: {
    id: "new-chat-id",
    status: "ready" as "ready" | "submitted" | "streaming" | "error",
    messages: [] as Array<{ id: string; role: string }>,
    onError: undefined as ((error: Error) => void) | undefined,
  },
  queryState: {
    initialChatId: "chat-from-account-a" as string | null,
  },
}));

vi.mock("@ai-sdk/react", () => ({
  useChat: (options: { onError?: (error: Error) => void }) => {
    chatState.onError = options.onError;
    return {
      id: chatState.id,
      messages: chatState.messages,
      status: chatState.status,
      setMessages: mockSetMessages,
      sendMessage: (message: unknown, requestOptions?: { body?: unknown }) =>
        mockSendMessage(message, requestOptions).catch((error) => {
          options.onError?.(error);
          throw error;
        }),
      stop: mockChatStop,
      resumeStream: mockResumeStream,
      regenerate: vi.fn(),
    };
  },
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

afterEach(() => {
  cleanup();
});

describe("ChatProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    accountState.emailAccountId = "account-a";
    chatState.id = "new-chat-id";
    chatState.status = "ready";
    chatState.messages = [];
    setVisibility("visible");
    mockChatStop.mockResolvedValue(undefined);
    mockResumeStream.mockResolvedValue(undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null)));
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

  it("keeps an in-progress reply when the saved chat refetches mid-run", async () => {
    const savedUserOnly = [
      {
        id: "user-message",
        role: "user",
        parts: [{ type: "text", text: "Hi" }],
      },
    ];
    const savedWithReply = [
      ...savedUserOnly,
      {
        id: "assistant-message",
        role: "assistant",
        parts: [{ type: "text", text: "Done" }],
      },
    ];
    let savedData = { messages: savedUserOnly };
    mockUseChatMessages.mockImplementation(() => ({ data: savedData }));
    mockConvertToUIMessages.mockImplementation(
      (data: { messages: unknown[] }) => data.messages,
    );

    const { rerender } = renderWithProvider(<div />);
    mockSetMessages.mockClear();

    // A focus refetch lands while the reply streams; the server has only saved
    // the user message so far.
    chatState.status = "streaming";
    savedData = { messages: [...savedUserOnly] };
    rerender(
      <ChatProvider>
        <div />
      </ChatProvider>,
    );
    expect(mockSetMessages).not.toHaveBeenCalled();

    // The run ends before its refetch returns: the stale mid-run data must not
    // replace the finished reply.
    chatState.status = "ready";
    rerender(
      <ChatProvider>
        <div />
      </ChatProvider>,
    );
    expect(mockSetMessages).not.toHaveBeenCalled();

    // The refetch after the run returns the saved reply.
    savedData = { messages: savedWithReply };
    rerender(
      <ChatProvider>
        <div />
      </ChatProvider>,
    );
    expect(mockSetMessages).toHaveBeenLastCalledWith(savedWithReply);
  });

  it("loads another chat's history when switching chats during a run", () => {
    const otherChat = [
      {
        id: "other-message",
        role: "user",
        parts: [{ type: "text", text: "Other" }],
      },
    ];
    let savedData: { messages: unknown[] } = { messages: [] };
    mockUseChatMessages.mockImplementation(() => ({ data: savedData }));
    mockConvertToUIMessages.mockImplementation(
      (data: { messages: unknown[] }) => data.messages,
    );

    chatState.status = "streaming";
    const { rerender } = renderWithProvider(<div />);
    mockSetMessages.mockClear();

    // Selecting another chat gives the SDK a fresh, idle chat instance.
    chatState.id = "other-chat";
    chatState.status = "ready";
    savedData = { messages: otherChat };
    rerender(
      <ChatProvider>
        <div />
      </ChatProvider>,
    );
    expect(mockSetMessages).toHaveBeenLastCalledWith(otherChat);
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

describe("ChatProvider interrupted replies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    accountState.emailAccountId = "account-a";
    queryState.initialChatId = "chat-1";
    chatState.status = "streaming";
    chatState.messages = [
      { id: "user-message", role: "user" },
      { id: "stream-1", role: "assistant" },
    ];
    setVisibility("visible");
    mockUseSWRConfig.mockReturnValue({ mutate: vi.fn() });
    mockUseChatMessages.mockReturnValue({
      data: { messages: [], activeStreamId: null },
    });
    mockConvertToUIMessages.mockReturnValue([]);
    mockClientLoggerFlush.mockResolvedValue(undefined);
    mockChatStop.mockResolvedValue(undefined);
    mockResumeStream.mockResolvedValue(undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null)));
  });

  it("stops the run on the server before stopping the local stream", async () => {
    let latestContext: ReturnType<typeof useChat> | undefined;
    function Consumer() {
      latestContext = useChat();
      return null;
    }
    renderWithProvider(<Consumer />);

    await act(async () => {
      await latestContext?.stop();
    });

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledWith("/api/chat/chat-1/stop", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [EMAIL_ACCOUNT_HEADER]: "account-a",
      },
      body: JSON.stringify({ activeStreamId: "stream-1" }),
    });
    expect(fetchMock.mock.invocationCallOrder[0]).toBeLessThan(
      mockChatStop.mock.invocationCallOrder[0],
    );
  });

  it("reattaches when the tab returns after the connection dropped mid-reply", async () => {
    renderWithProvider(<div />);

    setVisibility("hidden");
    act(() => {
      chatState.onError?.(new TypeError("Load failed"));
    });
    expect(mockResumeStream).not.toHaveBeenCalled();
    expect(mockToastError).not.toHaveBeenCalled();

    setVisibility("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(mockResumeStream).toHaveBeenCalledTimes(1);
  });

  it("reattaches when a backgrounded tab's stream stalled", async () => {
    renderWithProvider(<div />);

    await hideAndShowTab();

    expect(mockChatStop).toHaveBeenCalled();
    expect(mockResumeStream).toHaveBeenCalledTimes(1);
  });

  it("leaves a stream alone that kept updating in the background", async () => {
    const { rerender } = renderWithProvider(<div />);

    setVisibility("hidden");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    chatState.messages = [...chatState.messages];
    rerender(
      <ChatProvider>
        <div />
      </ChatProvider>,
    );
    setVisibility("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(mockResumeStream).not.toHaveBeenCalled();
  });

  it("reattaches to a reply still running when the chat is opened", async () => {
    chatState.status = "ready";
    chatState.messages = [];
    mockUseChatMessages.mockReturnValue({
      data: { messages: [], activeStreamId: "stream-1" },
    });

    await act(async () => {
      renderWithProvider(<div />);
    });

    expect(mockResumeStream).toHaveBeenCalledTimes(1);
  });

  it("does not reattach after an explicit stop", async () => {
    let latestContext: ReturnType<typeof useChat> | undefined;
    function Consumer() {
      latestContext = useChat();
      return null;
    }
    renderWithProvider(<Consumer />);

    await act(async () => {
      await latestContext?.stop();
    });
    await hideAndShowTab();

    expect(mockResumeStream).not.toHaveBeenCalled();
  });
});

async function hideAndShowTab() {
  setVisibility("hidden");
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
  setVisibility("visible");
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
}

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
