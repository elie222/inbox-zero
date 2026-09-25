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

it("saves skipped queued content after resuming", async () => {
  vi.useFakeTimers();
  const save = vi.fn().mockResolvedValue(undefined);
  const { result, unmount } = renderHook(() =>
    useProviderDraftAutosave({ enabled: true, getContent: () => "edit", save }),
  );
  act(() => result.current.capture());
  await act(async () => {
    vi.advanceTimersByTime(3000);
    await result.current.stop();
  });
  expect(save).not.toHaveBeenCalled();
  act(() => result.current.resume());
  await act(() => vi.advanceTimersByTimeAsync(3000));
  expect(save).toHaveBeenCalledExactlyOnceWith("edit");
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

it("syncs a closed composer when the connection returns", async () => {
  vi.useFakeTimers();
  const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  const save = vi.fn().mockResolvedValue(undefined);
  const { result, unmount } = renderHook(() =>
    useProviderDraftAutosave({
      enabled: true,
      sessionKey: "offline-compose",
      getContent: () => "offline edit",
      save,
    }),
  );
  act(() => result.current.capture());
  unmount();
  await act(() => vi.advanceTimersByTimeAsync(6000));
  expect(save).not.toHaveBeenCalled();
  online.mockReturnValue(true);
  await act(async () => {
    window.dispatchEvent(new Event("online"));
  });
  expect(save).toHaveBeenCalledExactlyOnceWith("offline edit");
  await act(() => vi.advanceTimersByTimeAsync(6000));
  expect(save).toHaveBeenCalledOnce();
});

it("a reopened composer takes over retries and waits for the previous save before sending", async () => {
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
  const first = renderHook(() =>
    useProviderDraftAutosave({
      enabled: true,
      sessionKey: "reopened-compose",
      getContent: () => "first",
      save,
    }),
  );
  act(() => first.result.current.capture());
  await act(() => vi.advanceTimersByTimeAsync(3000));
  first.unmount();
  const second = renderHook(() =>
    useProviderDraftAutosave({
      enabled: true,
      sessionKey: "reopened-compose",
      getContent: () => "second",
      save,
    }),
  );
  act(() => second.result.current.capture());
  let stopped = false;
  const stop = second.result.current.stop().then(() => {
    stopped = true;
  });
  await act(() => vi.advanceTimersByTimeAsync(3000));
  expect(stopped).toBe(false);
  await act(async () => {
    finish();
    await stop;
  });
  await act(() => vi.advanceTimersByTimeAsync(6000));
  expect(save).toHaveBeenCalledOnce();
  second.unmount();
});

it("stops retrying a closed composer after repeated failures and retries on reopen", async () => {
  vi.useFakeTimers();
  const save = vi.fn().mockRejectedValue(new Error("Unavailable"));
  const options = {
    enabled: true,
    sessionKey: "failed-closed-compose",
    getContent: () => "local draft",
    save,
  };
  const first = renderHook(() => useProviderDraftAutosave(options));
  act(() => first.result.current.capture());
  first.unmount();
  await act(() => vi.advanceTimersByTimeAsync(30_000));
  const attempts = save.mock.calls.length;
  expect(attempts).toBeGreaterThan(1);
  await act(async () => {
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(30_000);
  });
  expect(save).toHaveBeenCalledTimes(attempts);

  save.mockResolvedValue(undefined);
  const reopened = renderHook(() => useProviderDraftAutosave(options));
  act(() => reopened.result.current.capture());
  await act(() => vi.advanceTimersByTimeAsync(3000));
  expect(save).toHaveBeenCalledTimes(attempts + 1);
  expect(save).toHaveBeenLastCalledWith("local draft");
  reopened.unmount();
});

it("builds the mailbox draft once per save instead of on every keystroke", async () => {
  vi.useFakeTimers();
  const save = vi.fn().mockResolvedValue(undefined);
  const getContent = vi.fn(() => "edit");
  const { result, unmount } = renderHook(() =>
    useProviderDraftAutosave({ enabled: true, getContent, save }),
  );
  for (let keystroke = 0; keystroke < 20; keystroke++) {
    act(() => result.current.capture());
  }
  expect(getContent).not.toHaveBeenCalled();
  await act(() => vi.advanceTimersByTimeAsync(3000));
  expect(getContent).toHaveBeenCalledOnce();
  expect(save).toHaveBeenCalledExactlyOnceWith("edit");
  unmount();
});
