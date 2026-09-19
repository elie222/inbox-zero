import { describe, expect, it } from "vitest";
import { useMailboxView } from "./use-mailbox-view";

describe("useMailboxView", () => {
  it("exports a hook function", () => {
    expect(typeof useMailboxView).toBe("function");
  });
});
