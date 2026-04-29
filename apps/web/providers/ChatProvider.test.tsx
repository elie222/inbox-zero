// @vitest-environment jsdom

import { render, waitFor } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatProvider, useChat } from "./ChatProvider";

const {
  mockSetMessages,
  mockSetQueryState,
  mockUseChatMessages,
  mockUseSWRConfig,
  mockConvertToUIMessages,
  mockCaptureException,
  accountState,
  queryState,
} = vi.hoisted(() => ({
  mockSetMessages: vi.fn(),
  mockSetQueryState: vi.fn(),
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
  useChat: () => ({
    id: "new-chat-id",
    messages: [],
    status: "ready",
    setMessages: mockSetMessages,
    sendMessage: vi.fn(),
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

describe("ChatProvider account changes", () => {
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
});

function renderWithProvider(children: React.ReactNode) {
  return render(<ChatProvider>{children}</ChatProvider>);
}
