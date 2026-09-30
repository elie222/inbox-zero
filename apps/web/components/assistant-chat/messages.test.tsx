/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Messages } from "@/components/assistant-chat/messages";

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

(globalThis as { ResizeObserver?: typeof MockResizeObserver }).ResizeObserver =
  MockResizeObserver;

vi.mock("@/components/assistant-chat/overview", () => ({
  Overview: () => (
    <div>
      <p>Assistant reply</p>
      <button type="button">Confirm</button>
    </div>
  ),
}));

vi.mock("@/components/assistant-chat/message-part", () => ({
  MessagePart: () => null,
}));

vi.mock("@/components/assistant-chat/messaging-channel-hint", () => ({
  MessagingChannelHint: () => null,
}));

function renderMessages() {
  return render(
    <Messages
      status="ready"
      messages={[]}
      persistedMessageIds={new Set<string>()}
      setMessages={vi.fn()}
      setInput={vi.fn()}
      regenerate={vi.fn()}
      isArtifactVisible={false}
      footer={
        <form data-testid="composer">
          <textarea data-testid="chat-input" />
        </form>
      }
    />,
  );
}

describe("Messages keyboard dismissal", () => {
  afterEach(cleanup);

  it("blurs the chat input when touching the conversation so the mobile keyboard closes", () => {
    renderMessages();
    const input = screen.getByTestId("chat-input");
    input.focus();
    expect(document.activeElement).toBe(input);

    fireEvent.touchStart(screen.getByText("Assistant reply"));

    expect(document.activeElement).not.toBe(input);
  });

  it("keeps focus when touching an interactive element in the conversation", () => {
    renderMessages();
    const input = screen.getByTestId("chat-input");
    input.focus();

    fireEvent.touchStart(screen.getByRole("button", { name: "Confirm" }));

    expect(document.activeElement).toBe(input);
  });

  it("keeps focus when touching the composer around the input", () => {
    renderMessages();
    const input = screen.getByTestId("chat-input");
    input.focus();

    fireEvent.touchStart(screen.getByTestId("composer"));

    expect(document.activeElement).toBe(input);
  });
});
