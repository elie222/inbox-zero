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

function reader(threadId: string, text: string, bodyReady?: boolean) {
  return (
    <Reader
      threadId={threadId}
      text={text}
      bodyReady={bodyReady}
      enableMessageNavigation
    />
  ) as unknown as ReactElement<ThreadReaderProps>;
}

function Reader({
  threadId,
  text,
  bodyReady,
  enableMessageNavigation,
}: {
  threadId: string;
  text: string;
  bodyReady?: boolean;
  enableMessageNavigation: boolean;
}) {
  return (
    <div>
      {enableMessageNavigation && (
        <div data-testid="selection-bar" data-thread-id={threadId} />
      )}
      {text}
      {bodyReady !== undefined && <div data-email-ready={bodyReady} />}
    </div>
  );
}
