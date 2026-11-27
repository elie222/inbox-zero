// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useIsMobile, useIsMobileState } from "./use-mobile";

(globalThis as { React?: typeof React }).React = React;

describe("useIsMobile / useIsMobileState", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("reports undefined for useIsMobileState and false for useIsMobile during SSR and hydrates cleanly on mobile", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      get: () => 390,
    });
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));

    const html = renderToString(<ViewportProbe />);
    expect(html).toContain("undefined|false");

    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);
    const onRecoverableError = vi.fn();

    let root: ReturnType<typeof hydrateRoot> | undefined;
    try {
      act(() => {
        root = hydrateRoot(container, <ViewportProbe />, {
          onRecoverableError,
        });
      });

      expect(onRecoverableError).not.toHaveBeenCalled();
      expect(container.textContent).toBe("true|true");
    } finally {
      act(() => {
        root?.unmount();
      });
      container.remove();
    }
  });

  it("reads the current viewport on initial client render and updates across breakpoint changes", () => {
    const listeners = new Set<() => void>();
    let currentWidth = 390;

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      get: () => currentWidth,
    });
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: currentWidth < 768,
      media: query,
      addEventListener: (_event: string, listener: () => void) => {
        listeners.add(listener);
      },
      removeEventListener: (_event: string, listener: () => void) => {
        listeners.delete(listener);
      },
    }));

    const seenStates: Array<boolean | undefined> = [];
    function RecordingProbe() {
      const state = useIsMobileState();
      seenStates.push(state);
      return <ViewportProbe />;
    }

    render(<RecordingProbe />);

    expect(seenStates[0]).toBe(true);
    expect(screen.getByTestId("viewport-probe").textContent).toBe("true|true");

    act(() => {
      currentWidth = 1024;
      for (const listener of listeners) listener();
    });

    expect(screen.getByTestId("viewport-probe").textContent).toBe(
      "false|false",
    );

    act(() => {
      currentWidth = 640;
      for (const listener of listeners) listener();
    });

    expect(screen.getByTestId("viewport-probe").textContent).toBe("true|true");
  });
});

function ViewportProbe() {
  const isMobileState = useIsMobileState();
  const isMobile = useIsMobile();

  return (
    <output data-testid="viewport-probe">
      {`${String(isMobileState)}|${String(isMobile)}`}
    </output>
  );
}
