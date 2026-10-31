// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterAll, describe, expect, it, vi } from "vitest";
import { useOptimisticArchive } from "./use-optimistic-archive";
import type { ListThread } from "./types";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.stubGlobal("CSS", { escape: (value: string) => value });
afterAll(() => vi.unstubAllGlobals());

const threads = [{ id: "one" }, { id: "two" }, { id: "three" }] as ListThread[];

describe("optimistic archive", () => {
  it("keeps archiving one account from hiding a matching ID in another", async () => {
    const { result, rerender } = renderHook(
      ({ scope }) => useOptimisticArchive(threads, true, scope),
      { initialProps: { scope: "one-account" } },
    );
    const admission = Promise.withResolvers<string[]>();
    let archive!: Promise<string[]>;
    act(() => {
      archive = result.current.archive(["one"], () => admission.promise);
    });
    expect(result.current.threads).toHaveLength(2);
    rerender({ scope: "another-account" });
    expect(result.current.threads).toEqual(threads);
    await act(async () => {
      admission.resolve(["one"]);
      await archive;
    });
    expect(result.current.threads).toEqual(threads);
  });

  it("advances the list before admission and hands off to the engine snapshot", async () => {
    const { result, rerender } = renderHook(
      ({ rows }) => useOptimisticArchive(rows, true, "account"),
      { initialProps: { rows: threads } },
    );
    const admission = Promise.withResolvers<string[]>();
    let archive!: Promise<string[]>;
    act(() => {
      archive = result.current.archive(["one"], () => admission.promise);
    });
    expect(result.current.threads.map((thread) => thread.id)).toEqual([
      "two",
      "three",
    ]);
    rerender({ rows: threads.slice(1) });
    await act(async () => {
      admission.resolve(["one"]);
      await archive;
    });
    expect(result.current.threads.map((thread) => thread.id)).toEqual([
      "two",
      "three",
    ]);
    // Undo restores the engine's row without stale optimistic state hiding it.
    rerender({ rows: threads });
    expect(result.current.threads).toEqual(threads);
  });

  it("restores rejected rows after a partially accepted batch", async () => {
    const { result, rerender } = renderHook(
      ({ rows }) => useOptimisticArchive(rows, true, "account"),
      { initialProps: { rows: threads } },
    );
    const admission = Promise.withResolvers<string[]>();
    let archive!: Promise<string[]>;
    act(() => {
      archive = result.current.archive(["one", "two"], () => admission.promise);
    });
    expect(result.current.threads.map((thread) => thread.id)).toEqual([
      "three",
    ]);
    rerender({ rows: threads.slice(1) });
    await act(async () => {
      admission.resolve(["one"]);
      await archive;
    });
    expect(result.current.threads.map((thread) => thread.id)).toEqual([
      "two",
      "three",
    ]);
  });

  it("restores the row when submission throws", async () => {
    const { result } = renderHook(() =>
      useOptimisticArchive(threads, true, "account"),
    );
    await act(async () => {
      expect(
        await result.current.archive(["one"], async () => {
          throw new Error("offline");
        }),
      ).toEqual([]);
    });
    expect(result.current.threads).toEqual(threads);
  });

  it("keeps rows in views where archive does not remove them", async () => {
    const { result } = renderHook(() =>
      useOptimisticArchive(threads, false, "account"),
    );
    const admission = Promise.withResolvers<string[]>();
    let archive!: Promise<string[]>;
    act(() => {
      archive = result.current.archive(["one"], () => admission.promise);
    });
    expect(result.current.threads).toEqual(threads);
    await act(async () => {
      admission.resolve(["one"]);
      await archive;
    });
  });
});
