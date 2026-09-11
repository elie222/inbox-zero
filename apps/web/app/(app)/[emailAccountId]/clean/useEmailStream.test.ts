/** @vitest-environment jsdom */

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addThreadToEmailState, useEmailStream } from "./useEmailStream";
import type { CleanThread } from "@/utils/redis/clean.types";

describe("useEmailStream", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockEventSource.instances = [];
    vi.stubGlobal("EventSource", MockEventSource);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps the existing connection when a thread arrives", () => {
    renderHook(() => useEmailStream("account-id"));

    act(() => {
      MockEventSource.instances[0].emitThread(createThread("thread-1"));
    });

    expect(MockEventSource.instances).toHaveLength(1);
  });

  it("does not reconnect after unmounting during a retry delay", () => {
    const { unmount } = renderHook(() => useEmailStream("account-id"));

    act(() => {
      MockEventSource.instances[0].emitError();
    });
    unmount();
    act(() => vi.advanceTimersByTime(2000));

    expect(MockEventSource.instances).toHaveLength(1);
  });

  it("ignores errors from a connection after it has been replaced", () => {
    const { rerender } = renderHook(
      ({ emailAccountId }) => useEmailStream(emailAccountId),
      { initialProps: { emailAccountId: "first-account" } },
    );
    const firstConnection = MockEventSource.instances[0];

    rerender({ emailAccountId: "second-account" });
    firstConnection.emitError();
    act(() => vi.advanceTimersByTime(2000));

    expect(MockEventSource.instances).toHaveLength(2);
  });
});

describe("addThreadToEmailState", () => {
  it("evicts the oldest thread from both the map and order", () => {
    const first = createThread("first");
    const second = createThread("second");
    const third = createThread("third");

    const result = addThreadToEmailState(
      {
        emailsMap: { first, second },
        emailOrder: ["first", "second"],
      },
      third,
      2,
    );

    expect(result.emailOrder).toEqual(["second", "third"]);
    expect(result.emailsMap).toEqual({ second, third });
  });
});

class MockEventSource {
  static instances: MockEventSource[] = [];

  onerror: ((event: Event) => void) | null = null;
  private threadListener?: (event: MessageEvent<string>) => void;

  constructor() {
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    if (type === "thread" && typeof listener === "function") {
      this.threadListener = listener as (event: MessageEvent<string>) => void;
    }
  }

  close() {}

  emitThread(thread: CleanThread) {
    this.threadListener?.(
      new MessageEvent("thread", { data: JSON.stringify(thread) }),
    );
  }

  emitError() {
    this.onerror?.(new Event("error"));
  }
}

function createThread(threadId: string): CleanThread {
  return {
    threadId,
    date: new Date("2026-01-01T00:00:00.000Z"),
  } as CleanThread;
}
