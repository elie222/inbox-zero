/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/utils/actions/assistant-chat", () => ({
  confirmAssistantCreateRule: vi.fn(),
  confirmAssistantEmailAction: vi.fn(),
  confirmAssistantSaveMemory: vi.fn(),
}));
vi.mock("@/utils/actions/rule", () => ({
  deleteRuleAction: vi.fn(),
  toggleRuleAction: vi.fn(),
}));
vi.mock("next-safe-action/hooks", () => ({
  useAction: vi.fn(),
}));
vi.mock("@/providers/EmailAccountProvider", () => ({
  useAccount: vi.fn(),
}));
vi.mock("@/providers/ChatProvider", () => ({
  useChat: vi.fn(),
}));
vi.mock("nuqs", () => ({
  useQueryState: vi.fn(),
}));
vi.mock("@/app/(app)/[emailAccountId]/assistant/RuleDialog", () => ({
  RuleDialog: () => null,
}));
vi.mock("@/hooks/useDialogState", () => ({
  useDialogState: vi.fn(),
}));
vi.mock("@/components/assistant-chat/inline-email-card", () => ({
  InlineEmailCard: () => null,
  InlineEmailList: () => null,
  InlineEmailDetail: () => null,
}));

import { MessagePart } from "@/components/assistant-chat/message-part";

function renderPart(part: unknown) {
  return render(
    <MessagePart
      // The test drives shapes the AI SDK emits at runtime; the prop type is
      // the narrow union of parts we render explicitly.
      part={part as never}
      isStreaming={false}
      disableConfirm={false}
      isPersistedMessage={true}
      messageId="msg-1"
      partIndex={0}
      threadLookup={undefined as never}
    />,
  );
}

describe("MessagePart tool failures", () => {
  afterEach(cleanup);

  // A tool call the SDK could not parse against its schema arrives as a
  // `dynamic-tool` part in the "output-error" state. Before this was handled,
  // the whole part rendered as null, so a rejected rule edit showed the user
  // nothing at all while the assistant's prose often claimed success.
  it("renders the error for a dynamic-tool call that was rejected", () => {
    renderPart({
      type: "dynamic-tool",
      toolName: "updateRule",
      toolCallId: "call-1",
      state: "output-error",
      errorText: "Invalid arguments for tool updateRule",
    });

    // The SDK's errorText serializes the tool input, so the card shows a
    // curated message instead of echoing the user's data back at them.
    expect(screen.getByText(/nothing changed/)).toBeTruthy();
    expect(screen.queryByText(/Invalid arguments for tool updateRule/)).toBe(
      null,
    );
  });

  it("renders the error for a typed tool call that was rejected", () => {
    renderPart({
      type: "tool-updateRule",
      toolCallId: "call-2",
      state: "output-error",
      errorText: "Rule conditions were stale",
    });

    expect(screen.getByText(/nothing changed/)).toBeTruthy();
  });

  it("shows an in-flight dynamic-tool call instead of nothing", () => {
    const { container } = renderPart({
      type: "dynamic-tool",
      toolName: "updateRule",
      toolCallId: "call-3",
      state: "input-available",
    });

    expect(container.textContent?.trim()).not.toBe("");
  });
});
