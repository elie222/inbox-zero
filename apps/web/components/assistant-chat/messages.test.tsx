/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Messages } from "@/components/assistant-chat/messages";
import type { ChatMessage } from "@/components/assistant-chat/types";

vi.mock("@/components/assistant-chat/overview", () => ({
  Overview: () => null,
}));
// Stand-ins so the test covers how parts are grouped, not how each renders.
vi.mock("@/components/assistant-chat/message-part", () => ({
  MessagePart: ({ part }: { part: { type: string; text?: string } }) => (
    <div>{part.text ?? part.type}</div>
  ),
}));
vi.mock("@/components/assistant-chat/tools", () => ({
  SearchInboxResult: () => <div>tool-searchInbox</div>,
}));
vi.mock("@/components/assistant-chat/messaging-channel-hint", () => ({
  MessagingChannelHint: () => null,
}));
vi.mock("@/components/ai-elements/conversation", () => ({
  Conversation: ({ children }: { children: ReactNode }) => <>{children}</>,
  ConversationContent: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  ConversationScrollButton: () => null,
}));

afterEach(() => {
  cleanup();
});

describe("Messages", () => {
  it("folds thinking and lookups into one collapsed row but keeps replies visible", () => {
    renderMessages([
      { type: "reasoning", text: "Checking rules first", state: "done" },
      { type: "step-start" },
      finishedTool("tool-getUserRulesAndSettings", { rules: [] }),
      { type: "step-start" },
      finishedTool("tool-searchInbox", { queryUsed: "from:a", messages: [] }),
      { type: "text", text: "No rule covers this sender yet.", state: "done" },
      finishedTool("tool-searchInbox", { queryUsed: "from:b", messages: [] }),
      { type: "reasoning", text: "Paging through results", state: "done" },
    ]);

    expect(screen.getByText("No rule covers this sender yet.")).toBeTruthy();
    expect(screen.queryByText("tool-getUserRulesAndSettings")).toBeNull();
    expect(screen.getAllByText("Worked through 3 steps")).toHaveLength(1);
    expect(screen.getAllByText("Worked through 2 steps")).toHaveLength(1);

    fireEvent.click(screen.getByText("Worked through 3 steps"));
    expect(screen.getByText("tool-getUserRulesAndSettings")).toBeTruthy();
  });

  it("does not count a lookup that threw, since it renders nothing", () => {
    renderMessages([
      finishedTool("tool-getUserRulesAndSettings", { rules: [] }),
      {
        type: "tool-readEmail",
        toolCallId: "read-1",
        state: "output-error",
        input: {},
        errorText: "Timed out",
      },
      finishedTool("tool-getLearnedPatterns", { patterns: [] }),
      { type: "text", text: "Done.", state: "done" },
    ]);

    expect(screen.getByText("Worked through 2 steps")).toBeTruthy();
  });

  it("leaves a lone lookup as its own row", () => {
    renderMessages([
      finishedTool("tool-getUserRulesAndSettings", { rules: [] }),
      { type: "text", text: "Done.", state: "done" },
    ]);

    expect(screen.getByText("tool-getUserRulesAndSettings")).toBeTruthy();
    expect(screen.queryByTestId("chat-activity-group")).toBeNull();
  });
});

function renderMessages(parts: unknown[]) {
  const messages = [
    {
      id: "user-1",
      role: "user",
      parts: [{ type: "text", text: "Label these" }],
    },
    { id: "reply-1", role: "assistant", parts },
  ] as ChatMessage[];

  render(
    <Messages
      status="ready"
      messages={messages}
      persistedMessageIds={new Set(["user-1", "reply-1"])}
      isArtifactVisible={false}
      regenerate={vi.fn()}
      setInput={vi.fn()}
      setMessages={vi.fn()}
    />,
  );
}

function finishedTool(type: string, output: unknown) {
  return {
    type,
    toolCallId: `${type}-${Math.random()}`,
    state: "output-available",
    input: {},
    output,
  };
}
