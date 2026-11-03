// @vitest-environment jsdom

import type { PointerEvent as ReactPointerEvent } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useDragReorder } from "./use-drag-reorder";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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
  expect(result.current.suppressClickRef.current).toBe(false);
  for (const name of ["pointermove", "pointerup", "pointercancel", "keydown"]) {
    expect(remove).toHaveBeenCalledWith(name, expect.any(Function));
  }
  act(() => {
    dispatchPointer("pointermove", 20);
    dispatchPointer("pointerup", 20);
  });
  expect(start).toHaveBeenCalledTimes(active ? 1 : 0);
  expect(commit).not.toHaveBeenCalled();
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
