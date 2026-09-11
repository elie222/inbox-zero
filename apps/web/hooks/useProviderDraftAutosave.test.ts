// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useProviderDraftAutosave } from "./useProviderDraftAutosave";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("saves during continuous editing and skips unchanged drafts", async () => {
  vi.useFakeTimers();
  const save = vi.fn().mockResolvedValue(undefined);
  let content = "initial";
  const { result, unmount } = renderHook(() =>
    useProviderDraftAutosave({
      enabled: true,
      getContent: () => content,
      save,
    }),
  );
  for (let i = 0; i < 6; i++) {
    content = `edit ${i}`;
    act(() => result.current.capture());
    await act(() => vi.advanceTimersByTimeAsync(1000));
  }
  expect(save).toHaveBeenCalledTimes(2);
  await act(() => vi.advanceTimersByTimeAsync(3000));
  expect(save).toHaveBeenCalledTimes(2);
  unmount();
});

it("serializes writes and waits for an active save before stopping", async () => {
  vi.useFakeTimers();
  let finish!: () => void;
  const save = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue(undefined);
  let content = "first";
  const { result, unmount } = renderHook(() =>
    useProviderDraftAutosave({
      enabled: true,
      getContent: () => content,
      save,
    }),
  );
  act(() => result.current.capture());
  await act(() => vi.advanceTimersByTimeAsync(3000));
  content = "second";
  act(() => result.current.capture());
  await act(() => vi.advanceTimersByTimeAsync(6000));
  expect(save).toHaveBeenCalledTimes(1);
  let stopped = false;
  const stopping = result.current.stop().then(() => {
    stopped = true;
  });
  expect(stopped).toBe(false);
  await act(async () => {
    finish();
    await stopping;
  });
  await act(() => vi.advanceTimersByTimeAsync(6000));
  expect(save).toHaveBeenCalledTimes(1);
  unmount();
});

it("retries failed saves without requiring another edit", async () => {
  vi.useFakeTimers();
  const save = vi
    .fn()
    .mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValue(undefined);
  const { result, unmount } = renderHook(() =>
    useProviderDraftAutosave({ enabled: true, getContent: () => "edit", save }),
  );
  act(() => result.current.capture());
  await act(() => vi.advanceTimersByTimeAsync(3000));
  expect(result.current.error).toBe("Offline");
  await act(() => vi.advanceTimersByTimeAsync(3000));
  expect(save).toHaveBeenCalledTimes(2);
  expect(result.current.error).toBe("");
  unmount();
});

it("saves the latest edit on close even while an earlier save is pending", async () => {
  vi.useFakeTimers();
  let finish!: () => void;
  const save = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue(undefined);
  let content = "first";
  const { result, unmount } = renderHook(() =>
    useProviderDraftAutosave({
      enabled: true,
      getContent: () => content,
      save,
    }),
  );
  act(() => result.current.capture());
  await act(() => vi.advanceTimersByTimeAsync(3000));
  content = "last edit";
  act(() => result.current.capture());
  unmount();
  await act(async () => {
    finish();
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(save).toHaveBeenLastCalledWith("last edit");
  expect(save).toHaveBeenCalledTimes(2);
});

it("flushes the latest edit when hidden during an active save", async () => {
  vi.useFakeTimers();
  let finish!: () => void;
  const save = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue(undefined);
  let content = "first";
  const { result, unmount } = renderHook(() =>
    useProviderDraftAutosave({
      enabled: true,
      getContent: () => content,
      save,
    }),
  );
  act(() => result.current.capture());
  await act(() => vi.advanceTimersByTimeAsync(3000));
  content = "last edit";
  act(() => result.current.capture());
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  await act(async () => {
    finish();
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(save).toHaveBeenLastCalledWith("last edit");
  expect(save).toHaveBeenCalledTimes(2);
  unmount();
});

it("does not write an opened draft until an edit or local recovery is captured", async () => {
  vi.useFakeTimers();
  const save = vi.fn().mockResolvedValue(undefined);
  const { result, unmount } = renderHook(() =>
    useProviderDraftAutosave({
      enabled: true,
      getContent: () => "draft",
      save,
    }),
  );
  await act(() => vi.advanceTimersByTimeAsync(6000));
  expect(save).not.toHaveBeenCalled();
  act(() => result.current.capture());
  await act(() => vi.advanceTimersByTimeAsync(3000));
  expect(save).toHaveBeenCalledWith("draft");
  unmount();
});
