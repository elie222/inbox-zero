// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MailPanelErrorBoundary } from "./MailPanelErrorBoundary";

vi.mock("@/components/AppErrorBoundary", () => ({
  AppErrorBoundary: ({ reset }: { reset: () => void }) => (
    <button type="button" onClick={reset}>
      Try again
    </button>
  ),
}));

afterEach(cleanup);

describe("MailPanelErrorBoundary", () => {
  it("keeps sibling content usable and recovers on retry", () => {
    let broken = true;
    function Reader() {
      if (broken) throw new Error("Reader failed");
      return <div>Message content</div>;
    }
    render(
      <>
        <button type="button">Inbox</button>
        <MailPanelErrorBoundary
          resetKey="thread-1"
          title="Unable to show conversation"
        >
          <Reader />
        </MailPanelErrorBoundary>
      </>,
    );
    expect(screen.getByRole("button", { name: "Inbox" })).toBeTruthy();
    broken = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByText("Message content")).toBeTruthy();
  });

  it("recovers when the selection changes without remounting healthy content", () => {
    function Content({ broken }: { broken: boolean }) {
      if (broken) throw new Error("Reader failed");
      return <input aria-label="Reply" defaultValue="" />;
    }
    const { rerender } = render(
      <MailPanelErrorBoundary
        resetKey="thread-1"
        title="Unable to show conversation"
      >
        <Content broken />
      </MailPanelErrorBoundary>,
    );
    rerender(
      <MailPanelErrorBoundary
        resetKey="thread-2"
        title="Unable to show conversation"
      >
        <Content broken={false} />
      </MailPanelErrorBoundary>,
    );
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Draft" } });
    rerender(
      <MailPanelErrorBoundary
        resetKey="thread-3"
        title="Unable to show conversation"
      >
        <Content broken={false} />
      </MailPanelErrorBoundary>,
    );
    expect(screen.getByRole("textbox")).toBe(input);
    expect(input.value).toBe("Draft");
  });
});
