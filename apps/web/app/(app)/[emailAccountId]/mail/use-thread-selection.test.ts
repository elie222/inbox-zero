// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useThreadSelection } from "@/app/(app)/[emailAccountId]/mail/use-thread-selection";

const IDS = ["a", "b", "c", "d", "e"];

function setup(ids: string[] = IDS) {
  return renderHook(() => useThreadSelection(ids));
}

describe("useThreadSelection", () => {
  it("toggles a row on and back off", () => {
    const { result } = setup();

    act(() => result.current.toggle(1));
    expect([...result.current.selectedIds]).toEqual(["b"]);

    act(() => result.current.toggle(1));
    expect(result.current.hasSelection).toBe(false);
  });

  it("selects every row in the current mail view", () => {
    const { result } = setup();

    act(() => result.current.toggle(2));
    act(() => result.current.selectAll());

    expect([...result.current.selectedIds]).toEqual(IDS);
  });

  it("shift-clicks a range from the last toggled row", () => {
    const { result } = setup();

    act(() => result.current.toggle(1));
    act(() => result.current.selectRangeTo(3));

    expect([...result.current.selectedIds].sort()).toEqual(["b", "c", "d"]);
  });

  it("shift-clicking with nothing toggled yet just selects that row", () => {
    const { result } = setup();

    act(() => result.current.selectRangeTo(2));

    expect([...result.current.selectedIds]).toEqual(["c"]);
  });

  it("shrinks the extended range when reversing direction", () => {
    const { result } = setup();

    act(() => result.current.extendTo(1, 0));
    act(() => result.current.extendTo(2, 1));
    expect([...result.current.selectedIds].sort()).toEqual(["a", "b", "c"]);

    // Back towards the anchor: the range shrinks rather than staying grown
    act(() => result.current.extendTo(1, 2));
    expect([...result.current.selectedIds].sort()).toEqual(["a", "b"]);
  });

  it("keeps selections made before extension started", () => {
    const { result } = setup();

    act(() => result.current.toggle(4));
    act(() => result.current.extendTo(1, 0));
    act(() => result.current.extendTo(2, 1));

    expect([...result.current.selectedIds].sort()).toEqual([
      "a",
      "b",
      "c",
      "e",
    ]);

    // ...and shrinking must not eat the pre-existing one
    act(() => result.current.extendTo(0, 1));
    expect([...result.current.selectedIds].sort()).toEqual(["a", "e"]);
  });

  it("starts a fresh anchor after an explicit toggle", () => {
    const { result } = setup();

    act(() => result.current.extendTo(2, 0));
    act(() => result.current.toggle(4));
    act(() => result.current.extendTo(3, 4));

    expect([...result.current.selectedIds].sort()).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
    ]);
  });

  it("clamps extension at the list bounds", () => {
    const { result } = setup();

    act(() => result.current.extendTo(-1, 0));
    expect([...result.current.selectedIds]).toEqual(["a"]);

    act(() => result.current.clear());
    act(() => result.current.extendTo(99, 4));
    expect([...result.current.selectedIds]).toEqual(["e"]);
  });

  it("targets the focused row only when nothing is selected", () => {
    const { result } = setup();

    expect(result.current.targetIds("c")).toEqual(["c"]);

    act(() => result.current.toggle(0));
    expect(result.current.targetIds("c")).toEqual(["a"]);
  });

  it("targets nothing when there is no selection and no focused row", () => {
    const { result } = setup();
    expect(result.current.targetIds(undefined)).toEqual([]);
  });

  it("drops selections that are no longer in the current mail view", () => {
    const { result, rerender } = renderHook(
      ({ ids }) => useThreadSelection(ids),
      { initialProps: { ids: ["a", "b", "c"] } },
    );

    act(() => result.current.toggle(1));
    rerender({ ids: ["c", "d"] });

    expect(result.current.selectedCount).toBe(0);
    expect(result.current.targetIds("c")).toEqual(["c"]);
  });

  it("resets positional range state when rows reorder", () => {
    const { result, rerender } = renderHook(
      ({ ids }) => useThreadSelection(ids),
      { initialProps: { ids: ["a", "b", "c"] } },
    );

    act(() => result.current.toggle(0));
    rerender({ ids: ["c", "b", "a"] });
    act(() => result.current.selectRangeTo(1));

    expect([...result.current.selectedIds].sort()).toEqual(["a", "b"]);
  });

  it("keeps the shift-click anchor when the same rows refresh", () => {
    const { result, rerender } = renderHook(
      ({ ids }) => useThreadSelection(ids),
      { initialProps: { ids: ["a", "b", "c"] } },
    );

    act(() => result.current.toggle(0));
    rerender({ ids: ["a", "b", "c"] });
    act(() => result.current.selectRangeTo(2));

    expect([...result.current.selectedIds].sort()).toEqual(["a", "b", "c"]);
  });

  it("ignores a toggle for an index outside the list", () => {
    const { result } = setup();

    act(() => result.current.toggle(99));
    expect(result.current.hasSelection).toBe(false);
  });
});
