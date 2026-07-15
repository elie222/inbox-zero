import { describe, expect, it } from "vitest";
import { createTreeSelection } from "./tree-selection";

type Item = {
  id: string;
  name: string;
  parentId?: string;
};

const treeSelection = createTreeSelection<Item>({
  getId: (item) => item.id,
  getParentId: (item) => item.parentId,
});

describe("tree selection", () => {
  it("preserves the children map when the children array is unchanged", () => {
    const children = [item("child", "Original", "parent")];
    const childrenByParentId = new Map([["parent", children]]);

    expect(
      treeSelection.mergeChildren({
        childrenByParentId,
        parentId: "parent",
        children,
      }),
    ).toBe(childrenByParentId);
  });

  it("stores refreshed child metadata when IDs are unchanged", () => {
    const childrenByParentId = new Map([
      ["parent", [item("child", "Original", "parent")]],
    ]);
    const refreshedChildren = [item("child", "Renamed", "parent")];

    const result = treeSelection.mergeChildren({
      childrenByParentId,
      parentId: "parent",
      children: refreshedChildren,
    });

    expect(result).not.toBe(childrenByParentId);
    expect(result.get("parent")).toBe(refreshedChildren);
  });

  it("distinguishes child lists whose comma-containing IDs would collide", () => {
    const childrenByParentId = new Map([
      ["parent", [item("a,b", "First"), item("c", "Second")]],
    ]);
    const nextChildren = [item("a", "First"), item("b,c", "Second")];

    const result = treeSelection.mergeChildren({
      childrenByParentId,
      parentId: "parent",
      children: nextChildren,
    });

    expect(result.get("parent")).toBe(nextChildren);
  });
});

function item(id: string, name: string, parentId?: string): Item {
  return { id, name, parentId };
}
