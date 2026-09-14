// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useCloseComposeOnMailExit } from "./useCloseComposeOnMailExit";

describe("useCloseComposeOnMailExit", () => {
  it("closes compose when navigation leaves the mail view", () => {
    const closeCompose = vi.fn();
    const { rerender } = renderHook(
      ({ isMailView }) =>
        useCloseComposeOnMailExit({ isMailView, closeCompose }),
      { initialProps: { isMailView: true } },
    );

    rerender({ isMailView: false });

    expect(closeCompose).toHaveBeenCalledOnce();
  });

  it("does not close compose while staying in the mail view", () => {
    const closeCompose = vi.fn();
    const { rerender } = renderHook(
      ({ isMailView }) =>
        useCloseComposeOnMailExit({ isMailView, closeCompose }),
      { initialProps: { isMailView: true } },
    );

    rerender({ isMailView: true });

    expect(closeCompose).not.toHaveBeenCalled();
  });

  it("does not close compose when entering the mail view", () => {
    const closeCompose = vi.fn();
    const { rerender } = renderHook(
      ({ isMailView }) =>
        useCloseComposeOnMailExit({ isMailView, closeCompose }),
      { initialProps: { isMailView: false } },
    );

    rerender({ isMailView: true });

    expect(closeCompose).not.toHaveBeenCalled();
  });
});
