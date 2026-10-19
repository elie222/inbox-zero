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
});

function reader(threadId: string, text: string, bodyReady?: boolean) {
  return (
    <Reader threadId={threadId} text={text} bodyReady={bodyReady} />
  ) as unknown as ReactElement<ThreadReaderProps>;
}

function Reader({
  text,
  bodyReady,
}: {
  threadId: string;
  text: string;
  bodyReady?: boolean;
}) {
  return (
    <div>
      {text}
      {bodyReady !== undefined && <div data-email-ready={bodyReady} />}
    </div>
  );
}
