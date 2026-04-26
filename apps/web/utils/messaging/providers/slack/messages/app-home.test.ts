import { describe, it, expect } from "vitest";
import { buildAppHomeBlocks } from "./app-home";

describe("buildAppHomeBlocks", () => {
  it("returns a view payload with type home", () => {
    const view = buildAppHomeBlocks();
    expect(view.type).toBe("home");
    expect(view.blocks).toBeDefined();
    expect(view.blocks.length).toBeGreaterThan(0);
  });

  it("includes a header block", () => {
    const view = buildAppHomeBlocks();
    const header = view.blocks.find(
      (b: { type: string }) => b.type === "header",
    );
    expect(header).toBeDefined();
  });

  it("includes slash command documentation", () => {
    const view = buildAppHomeBlocks();
    const text = JSON.stringify(view.blocks);
    expect(text).toContain("/summary");
    expect(text).toContain("/draftreply");
    expect(text).toContain("/cleanup");
    expect(text).toContain("/followups");
  });
});
