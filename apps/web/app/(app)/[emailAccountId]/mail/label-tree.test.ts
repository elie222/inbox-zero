import { describe, expect, it } from "vitest";
import { getLabelTree } from "./label-tree";

describe("getLabelTree", () => {
  it("groups descendants regardless of input order and retains original labels", () => {
    const child = { id: "child", name: "Work/Clients/Acme" };
    const tree = getLabelTree(
      [
        child,
        { id: "other", name: "Other" },
        { id: "work", name: "Work" },
        { id: "clients", name: "Work/Clients" },
      ],
      true,
    );
    expect(tree.map((node) => node.name)).toEqual(["Other", "Work"]);
    expect(tree[1].children[0].name).toBe("Clients");
    expect(tree[1].children[0].children[0]).toEqual({
      label: child,
      name: "Acme",
      children: [],
    });
  });

  it("keeps missing path segments and does not group mere name prefixes", () => {
    const tree = getLabelTree(
      [
        { id: "work", name: "Work" },
        { id: "child", name: "Work/Clients/Acme" },
        { id: "prefix", name: "Workshop/Notes" },
      ],
      true,
    );
    expect(tree[0].children[0].name).toBe("Clients/Acme");
    expect(tree[1].name).toBe("Workshop/Notes");
  });

  it("keeps categories flat when nesting is disabled", () => {
    const tree = getLabelTree(
      [
        { id: "work", name: "Work" },
        { id: "child", name: "Work/Clients" },
      ],
      false,
    );
    expect(tree.map((node) => node.name)).toEqual(["Work", "Work/Clients"]);
    expect(tree.every((node) => node.children.length === 0)).toBe(true);
  });
});
