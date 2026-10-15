// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PanelResizeHandle } from "./PanelResizeHandle";

const bounds = { min: 200, max: 400 };

// jsdom has no layout, so give the handle a positioned panel of a known width.
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockImplementation(
    function (this: HTMLElement) {
      return this.parentElement;
    },
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: 300,
    left: 0,
    right: 300,
  } as DOMRect);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PanelResizeHandle", () => {
  it("widens a right-edge panel with the right arrow key", () => {
    const { onResize, onResizeEnd } = renderHandle("right");

    fireEvent.keyDown(screen.getByRole("separator"), { key: "ArrowRight" });

    expect(onResize).toHaveBeenCalledWith(316);
    expect(onResizeEnd).toHaveBeenCalledWith(316);
  });

  it("widens a left-edge panel with the left arrow key", () => {
    const { onResize, onResizeEnd } = renderHandle("left");

    fireEvent.keyDown(screen.getByRole("separator"), { key: "ArrowLeft" });

    expect(onResize).toHaveBeenCalledWith(316);
    expect(onResizeEnd).toHaveBeenCalledWith(316);
  });

  it("narrows a left-edge panel with the right arrow key", () => {
    const { onResize } = renderHandle("left");

    fireEvent.keyDown(screen.getByRole("separator"), { key: "ArrowRight" });

    expect(onResize).toHaveBeenCalledWith(284);
  });

  it("resets to the default on double-click", () => {
    const { onReset, onResizeEnd } = renderHandle("right");

    fireEvent.doubleClick(screen.getByRole("separator"));

    expect(onReset).toHaveBeenCalledTimes(1);
    expect(onResizeEnd).not.toHaveBeenCalled();
  });
});

function renderHandle(edge: "left" | "right") {
  const onResize = vi.fn();
  const onResizeEnd = vi.fn();
  const onReset = vi.fn();
  render(
    <div>
      <PanelResizeHandle
        label="Resize panel"
        edge={edge}
        bounds={bounds}
        onResize={onResize}
        onResizeEnd={onResizeEnd}
        onReset={onReset}
      />
    </div>,
  );
  return { onResize, onResizeEnd, onReset };
}
