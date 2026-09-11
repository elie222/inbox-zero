// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useToggleSelect } from "./useToggleSelect";

const items = [{ id: "suggested-1" }, { id: "hidden" }, { id: "suggested-2" }];

describe("useToggleSelect", () => {
  it("limits select all to the supplied visible items", () => {
    const { result } = renderHook(() => useToggleSelect(items));

    act(() => {
      result.current.onToggleSelectItems(["suggested-1", "suggested-2"]);
    });

    expect(result.current.selected.get("suggested-1")).toBe(true);
    expect(result.current.selected.get("suggested-2")).toBe(true);
    expect(result.current.selected.get("hidden")).toBeUndefined();
  });

  it("limits shift selection to the supplied visible items", () => {
    const { result } = renderHook(() => useToggleSelect(items));
    const visibleIds = ["suggested-1", "suggested-2"];

    act(() => {
      result.current.onToggleSelect("suggested-1", false, visibleIds);
      result.current.onToggleSelect("suggested-2", true, visibleIds);
    });

    expect(result.current.selected.get("suggested-1")).toBe(true);
    expect(result.current.selected.get("suggested-2")).toBe(true);
    expect(result.current.selected.get("hidden")).toBeUndefined();
  });
});
