// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BufferedThreadReader } from "./BufferedThreadReader";
import type { ThreadReaderProps } from "./ThreadReader";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("BufferedThreadReader", () => {
  it("keeps an open reply through a same-thread refresh past the reveal deadline", () => {
    const onReady = vi.fn();
    const { rerender } = render(
      <BufferedThreadReader threadKey="one" dataReady onReady={onReady}>
        {reader("one", "Open reply")}
      </BufferedThreadReader>,
    );
    act(() => vi.advanceTimersByTime(3000));
    const editor = screen.getByRole("textbox") as HTMLInputElement;
    editor.value = "Reply in progress";
    editor.focus();

    rerender(
      <BufferedThreadReader threadKey="one" dataReady={false} onReady={onReady}>
        {reader("one", "Loading refreshed thread", undefined, true)}
      </BufferedThreadReader>,
    );
    act(() => vi.advanceTimersByTime(3000));
    rerender(
      <BufferedThreadReader threadKey="one" dataReady={false} onReady={onReady}>
        {reader("one", "Still refreshing thread", undefined, true)}
      </BufferedThreadReader>,
    );
    expect(screen.queryByText("Loading refreshed thread")).toBeNull();
    expect(screen.getByText("Open reply")).toBeTruthy();
    expect(screen.getByRole("textbox")).toBe(editor);
    expect(editor.value).toBe("Reply in progress");
    expect(document.activeElement).toBe(editor);

    rerender(
      <BufferedThreadReader threadKey="one" dataReady onReady={onReady}>
        {reader("one", "Updated thread")}
      </BufferedThreadReader>,
    );
    expect(screen.getByText("Updated thread")).toBeTruthy();
    expect(screen.getByRole("textbox")).toBe(editor);
    expect(editor.value).toBe("Reply in progress");
    expect(document.activeElement).toBe(editor);
  });

  it("reveals the first header and body together once the body is ready", () => {
    const onReady = vi.fn();
    const { rerender } = render(
      <BufferedThreadReader threadKey="one" dataReady onReady={onReady}>
        {reader("one", "First thread", false)}
      </BufferedThreadReader>,
    );
    expect(
      screen.getByText("First thread").closest("[aria-hidden]"),
    ).not.toBeNull();
    expect(onReady).not.toHaveBeenCalled();

    rerender(
      <BufferedThreadReader threadKey="one" dataReady onReady={onReady}>
        {reader("one", "First thread", true)}
      </BufferedThreadReader>,
    );
    expect(
      screen.getByText("First thread").closest("[aria-hidden]"),
    ).toBeNull();
    expect(onReady).toHaveBeenCalledWith("one");
  });

  it("bounds the wait for the first body without extending it on updates", () => {
    const onReady = vi.fn();
    const { rerender } = render(
      <BufferedThreadReader threadKey="one" dataReady={false} onReady={onReady}>
        {reader("one", "First thread", false)}
      </BufferedThreadReader>,
    );
    act(() => vi.advanceTimersByTime(1500));
    rerender(
      <BufferedThreadReader threadKey="one" dataReady onReady={onReady}>
        {reader("one", "First thread", false)}
      </BufferedThreadReader>,
    );
    expect(onReady).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(500));
    expect(
      screen.getByText("First thread").closest("[aria-hidden]"),
    ).toBeNull();
    expect(onReady).toHaveBeenCalledWith("one");
  });

  it("stops showing the previous thread when the next one never loads", () => {
    const onReady = vi.fn();
    const { rerender } = render(
      <BufferedThreadReader threadKey="one" dataReady onReady={onReady}>
        {reader("one", "First thread")}
      </BufferedThreadReader>,
    );
    expect(screen.getByText("First thread")).toBeTruthy();

    rerender(
      <BufferedThreadReader threadKey="two" dataReady={false} onReady={onReady}>
        {reader("two", "Loading second thread")}
      </BufferedThreadReader>,
    );
    expect(screen.getByText("First thread")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.queryByText("First thread")).toBeNull();
    expect(screen.getByText("Loading second thread")).toBeTruthy();
    expect(onReady).toHaveBeenLastCalledWith("two");
  });

  it("keeps the previous thread until the next email body is prepared", () => {
    const onReady = vi.fn();
    const { rerender } = render(
      <BufferedThreadReader threadKey="one" dataReady onReady={onReady}>
        {reader("one", "First thread")}
      </BufferedThreadReader>,
    );

    rerender(
      <BufferedThreadReader threadKey="two" dataReady onReady={onReady}>
        {reader("two", "Second thread", false)}
      </BufferedThreadReader>,
    );
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByText("First thread")).toBeTruthy();

    rerender(
      <BufferedThreadReader threadKey="two" dataReady onReady={onReady}>
        {reader("two", "Second thread", true)}
      </BufferedThreadReader>,
    );
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(screen.queryByText("First thread")).toBeNull();
    expect(onReady).toHaveBeenLastCalledWith("two");
  });

  it("keeps the empty reader until the first thread's body is prepared", () => {
    const onReady = vi.fn();
    const { rerender } = render(
      <BufferedThreadReader threadKey="empty" dataReady onReady={onReady}>
        {emptyReader()}
      </BufferedThreadReader>,
    );

    rerender(
      <BufferedThreadReader threadKey="one" dataReady onReady={onReady}>
        {reader("one", "First thread", false)}
      </BufferedThreadReader>,
    );
    expect(screen.getByText("Nothing selected")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();

    rerender(
      <BufferedThreadReader threadKey="one" dataReady onReady={onReady}>
        {reader("one", "First thread", true)}
      </BufferedThreadReader>,
    );
    expect(screen.queryByText("Nothing selected")).toBeNull();
    expect(onReady).toHaveBeenLastCalledWith("one");
  });

  it("keeps the selection bar on the previous thread while the next one loads", () => {
    const onReady = vi.fn();
    const { rerender } = render(
      <BufferedThreadReader threadKey="one" dataReady onReady={onReady}>
        {reader("one", "First thread")}
      </BufferedThreadReader>,
    );
    expect(screen.getAllByTestId("selection-bar")).toHaveLength(1);

    rerender(
      <BufferedThreadReader threadKey="two" dataReady onReady={onReady}>
        {reader("two", "Second thread", false)}
      </BufferedThreadReader>,
    );

    expect(screen.getByText("First thread")).toBeTruthy();
    const bars = screen.getAllByTestId("selection-bar");
    expect(bars).toHaveLength(1);
    expect(bars[0]?.dataset.threadId).toBe("one");
  });
});

function reader(
  threadId: string,
  text: string,
  bodyReady?: boolean,
  loading = false,
) {
  return (
    <Reader
      threadId={threadId}
      text={text}
      bodyReady={bodyReady}
      loading={loading}
      enableMessageNavigation
    />
  ) as unknown as ReactElement<ThreadReaderProps>;
}

function emptyReader() {
  return (
    <Reader threadId={null} text="Nothing selected" enableMessageNavigation />
  ) as unknown as ReactElement<ThreadReaderProps>;
}

function Reader({
  threadId,
  text,
  bodyReady,
  enableMessageNavigation,
  loading,
}: {
  threadId: string | null;
  text: string;
  bodyReady?: boolean;
  loading?: boolean;
  enableMessageNavigation: boolean;
}) {
  return (
    <div>
      {enableMessageNavigation && (
        <div data-testid="selection-bar" data-thread-id={threadId ?? ""} />
      )}
      {text}
      {!loading && <input aria-label="Reply" />}
      {bodyReady !== undefined && <div data-email-ready={bodyReady} />}
    </div>
  );
}
