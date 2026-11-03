// @vitest-environment jsdom

import { createElement, type PointerEvent as ReactPointerEvent } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useDragReorder } from "./use-drag-reorder";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it.each([
  false,
  true,
])("Escape cancels tracking with active drag = %s", (active) => {
  const remove = vi.spyOn(window, "removeEventListener");
  const start = vi.fn(() => ({ id: "item-1", order: ["item-2", "item-1"] }));
  const commit = vi.fn();
  const { result } = renderHook(() => useDragReorder());
  act(() =>
    result.current.trackPress(
      { button: 0, clientX: 0, clientY: 0 } as ReactPointerEvent<HTMLElement>,
      {
        start,
        commit,
        orderForPointer: () => null,
      },
    ),
  );
  if (active) act(() => dispatchPointer("pointermove", 10));
  act(() =>
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })),
  );
  expect(result.current.drag).toBeNull();
  expect(result.current.suppressClickRef.current).toBe(active);
  const removed = active
    ? ["pointermove", "keydown"]
    : ["pointermove", "pointerup", "pointercancel", "keydown"];
  for (const name of removed) {
    expect(remove).toHaveBeenCalledWith(name, expect.any(Function));
  }
  act(() => {
    dispatchPointer("pointermove", 20);
    dispatchPointer("pointerup", 20);
  });
  expect(start).toHaveBeenCalledTimes(active ? 1 : 0);
  expect(commit).not.toHaveBeenCalled();
});

it("Escape during an active drag suppresses selection on release and allows the next click", () => {
  vi.useFakeTimers();
  const select = vi.fn();
  const commit = vi.fn();
  function Item() {
    const { trackPress, suppressClickRef } = useDragReorder();
    return createElement(
      "button",
      {
        type: "button",
        onPointerDown: (event: ReactPointerEvent<HTMLElement>) =>
          trackPress(event, {
            start: () => ({ id: "item-1", order: ["item-1"] }),
            orderForPointer: () => null,
            commit,
          }),
        onClick: () => {
          if (!suppressClickRef.current) select();
        },
      },
      "Account",
    );
  }
  const { getByRole } = render(createElement(Item));
  const item = getByRole("button", { name: "Account" });
  // jsdom has no native PointerEvent constructor.
  fireEvent(item, new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
  act(() => dispatchPointer("pointermove", 10));
  fireEvent.keyDown(window, { key: "Escape" });
  act(() => dispatchPointer("pointermove", 20));
  act(() => dispatchPointer("pointerup", 20));
  fireEvent.click(item);
  expect(select).not.toHaveBeenCalled();
  expect(commit).not.toHaveBeenCalled();
  act(() => vi.runAllTimers());
  fireEvent.click(item);
  expect(select).toHaveBeenCalledOnce();
});

it("commits a completed drag and suppresses the release click", () => {
  const commit = vi.fn();
  const { result } = renderHook(() => useDragReorder());
  act(() =>
    result.current.trackPress(
      { button: 0, clientX: 0, clientY: 0 } as ReactPointerEvent<HTMLElement>,
      {
        start: () => ({ id: "item-1", order: ["item-2", "item-1"] }),
        commit,
        orderForPointer: () => null,
      },
    ),
  );
  act(() => {
    dispatchPointer("pointermove", 10);
    dispatchPointer("pointerup", 10);
  });
  expect(commit).toHaveBeenCalledWith(["item-2", "item-1"]);
  expect(result.current.suppressClickRef.current).toBe(true);
});

function dispatchPointer(type: string, x: number) {
  window.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: 0 }));
}
