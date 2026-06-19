/** @vitest-environment jsdom */

import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatHistoryEntry } from "@/components/assistant-chat/chat-history-types";
import type { Chat as ChatHelpers } from "@/providers/ChatProvider";

(globalThis as { React?: typeof React }).React = React;

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

(globalThis as { ResizeObserver?: typeof MockResizeObserver }).ResizeObserver =
  MockResizeObserver;

const {
  mockCaptureAction,
  mockHandleSubmit,
  mockMutate,
  mockRegenerate,
  mockSetAttachments,
  mockSetChatId,
  mockSetContext,
  mockSetInput,
  mockSetLocalStorageInput,
  mockSetMessages,
  mockSetNewChat,
  mockStop,
  mockUseChats,
} = vi.hoisted(() => ({
  mockCaptureAction: vi.fn(),
  mockHandleSubmit: vi.fn(),
  mockMutate: vi.fn(),
  mockRegenerate: vi.fn(),
  mockSetAttachments: vi.fn(),
  mockSetChatId: vi.fn(),
  mockSetContext: vi.fn(),
  mockSetInput: vi.fn(),
  mockSetLocalStorageInput: vi.fn(),
  mockSetMessages: vi.fn(),
  mockSetNewChat: vi.fn(),
  mockStop: vi.fn(),
  mockUseChats: vi.fn(),
}));

vi.mock("@/components/assistant-chat/messages", () => ({
  Messages: ({ footer }: { footer?: React.ReactNode }) => (
    <div data-testid="messages">{footer}</div>
  ),
}));

vi.mock("@/components/assistant-chat/preview-attachment", () => ({
  PreviewAttachment: () => <div data-testid="preview-attachment" />,
}));

vi.mock("@/components/assistant-chat/RenameChatDialog", () => ({
  RenameChatDialog: () => null,
}));

vi.mock("@/components/assistant-chat/DeleteChatDialog", () => ({
  DeleteChatDialog: () => null,
}));

vi.mock("next-safe-action/hooks", () => ({
  useAction: () => ({
    execute: vi.fn(),
    isExecuting: false,
    result: undefined,
  }),
}));

vi.mock("@/utils/actions/chat", () => ({
  deleteChatAction: vi.fn(),
  renameChatAction: vi.fn(),
}));

vi.mock("@/utils/actions/safe-action", () => {
  function createActionClientMock() {
    const client = {
      bindArgsSchemas: () => client,
      use: () => client,
      metadata: () => client,
      inputSchema: () => client,
      action: vi.fn(),
    };

    return client;
  }

  return {
    actionClient: createActionClientMock(),
    actionClientUser: createActionClientMock(),
    adminActionClient: createActionClientMock(),
  };
});

vi.mock("@/components/ai-elements/prompt-input", () => ({
  PromptInput: ({
    children,
    onSubmit,
  }: {
    children: React.ReactNode;
    onSubmit: React.FormEventHandler<HTMLFormElement>;
  }) => <form onSubmit={onSubmit}>{children}</form>,
  PromptInputTextarea: (
    props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  ) => <textarea {...props} />,
  PromptInputSubmit: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { status: string }) => (
    <button type="submit" {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/Tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("better-auth/react", () => ({
  createAuthClient: () => ({
    signIn: vi.fn(),
    signOut: vi.fn(),
    signUp: vi.fn(),
    useSession: () => ({
      data: { user: { name: "Barbara" } },
    }),
    getSession: vi.fn(),
    sso: {},
  }),
}));

vi.mock("@better-auth/sso/client", () => ({
  ssoClient: () => ({}),
}));

vi.mock("better-auth/client/plugins", () => ({
  genericOAuthClient: () => ({}),
  organizationClient: () => ({}),
}));

vi.mock("@/utils/prisma", () => ({
  default: {},
}));

vi.mock("@/hooks/useChats", () => ({
  useChats: (shouldFetch: boolean) => mockUseChats(shouldFetch),
}));

vi.mock("@/hooks/useProductAnalytics", () => ({
  useProductAnalytics: () => ({
    captureAction: mockCaptureAction,
  }),
}));

vi.mock("@/providers/ChatProvider", () => ({
  useChat: () => ({
    chat: {
      messages: [],
      status: "ready",
      stop: mockStop,
      regenerate: mockRegenerate,
      setMessages: mockSetMessages,
      sendMessage: vi.fn(),
    } satisfies Partial<ChatHelpers>,
    chatId: null,
    input: "",
    persistedMessageIds: new Set(),
    setInput: mockSetInput,
    handleSubmit: mockHandleSubmit,
    setNewChat: mockSetNewChat,
    context: null,
    setContext: mockSetContext,
    attachments: [],
    setAttachments: mockSetAttachments,
    setChatId: mockSetChatId,
  }),
}));

vi.mock("@/utils/auth-client", () => ({
  useSession: () => ({
    data: { user: { name: "Barbara" } },
  }),
}));

vi.mock("usehooks-ts", () => ({
  useLocalStorage: () => ["", mockSetLocalStorageInput] as const,
}));

afterEach(() => {
  cleanup();
});

describe("Chat history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseChats.mockImplementation((shouldFetch: boolean) => ({
      data: shouldFetch ? { chats: [chatHistoryEntry] } : undefined,
      error: undefined,
      isLoading: false,
      mutate: mockMutate,
    }));
  });

  it("loads previous chats when the history menu is opened without hover", async () => {
    const { Chat } = await import("@/components/assistant-chat/chat");

    render(<Chat open />);

    fireEvent.pointerDown(
      screen.getByRole("button", { name: /chat history/i }),
    );

    expect(await screen.findByText("Project update")).toBeTruthy();

    fireEvent.click(screen.getByText("Project update"));

    await waitFor(() => {
      expect(mockSetChatId).toHaveBeenCalledWith("chat-1");
    });
  });
});

const chatHistoryEntry = {
  id: "chat-1",
  name: "Project update",
  createdAt: new Date("2026-05-23T00:00:00.000Z"),
  updatedAt: new Date("2026-05-23T00:00:00.000Z"),
  deletedAt: null,
  compactionCount: 0,
  lastSeenRulesRevision: null,
  emailAccountId: "email-account-1",
} satisfies ChatHistoryEntry;
