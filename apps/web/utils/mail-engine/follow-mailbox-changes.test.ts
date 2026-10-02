/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { followMailboxChanges } from "./follow-mailbox-changes";

describe("followMailboxChanges", () => {
  let sources: FakeEventSource[];
  let stops: (() => void)[];

  beforeEach(() => {
    sources = [];
    stops = [];
    setVisibility("visible");
  });

  afterEach(() => {
    for (const stop of stops) stop();
    setVisibility("visible");
  });

  function follow(onChange = vi.fn()) {
    const stop = followMailboxChanges({
      accountId: "acc/1",
      onChange,
      createEventSource: (url) => {
        const source = new FakeEventSource(url);
        sources.push(source);
        return source as unknown as EventSource;
      },
    });
    stops.push(stop);
    return { onChange, stop };
  }

  it("syncs when the server signals a mailbox change", () => {
    const { onChange } = follow();

    expect(sources).toHaveLength(1);
    expect(sources[0].url).toBe("/api/mail-stream?emailAccountId=acc%2F1");
    sources[0].emit("mailbox-change");
    sources[0].emit("heartbeat");

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("holds no connection while hidden and catches up when shown again", () => {
    const { onChange } = follow();

    setVisibility("hidden");
    expect(sources[0].closed).toBe(true);

    setVisibility("visible");
    expect(sources).toHaveLength(2);
    expect(sources[1].closed).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("does not connect while starting hidden", () => {
    setVisibility("hidden");
    follow();

    expect(sources).toHaveLength(0);
  });

  it("closes the connection when stopped", () => {
    const { stop } = follow();

    stop();
    setVisibility("hidden");
    setVisibility("visible");

    expect(sources).toHaveLength(1);
    expect(sources[0].closed).toBe(true);
  });
});

class FakeEventSource {
  closed = false;
  private readonly listeners = new Map<string, Set<() => void>>();

  readonly url: string;

  constructor(url: string) {
    this.url = url;
  }

  addEventListener(type: string, listener: () => void) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  close() {
    this.closed = true;
  }

  emit(type: string) {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}
