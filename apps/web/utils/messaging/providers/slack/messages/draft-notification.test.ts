import { describe, it, expect } from "vitest";
import {
  buildDraftNotificationBlocks,
  buildDraftSentBlocks,
  buildDraftDismissedBlocks,
} from "./draft-notification";

describe("buildDraftNotificationBlocks", () => {
  it("builds blocks with header, recipient, subject, body, and action buttons", () => {
    const blocks = buildDraftNotificationBlocks({
      recipient: "sender@example.com",
      subject: "Re: Meeting next week",
      draftBody: "Tuesday at 2pm works for me.",
    });

    const header = blocks.find((b) => b.type === "header");
    expect(header).toBeDefined();

    const actions = blocks.find((b) => b.type === "actions");
    expect(actions).toBeDefined();

    const actionsBlock = actions as { type: "actions"; elements: unknown[] };
    expect(actionsBlock.elements).toHaveLength(3);
  });

  it("truncates long draft bodies", () => {
    const longBody = "x".repeat(2000);
    const blocks = buildDraftNotificationBlocks({
      recipient: "test@test.com",
      subject: "Test",
      draftBody: longBody,
    });

    const bodySection = blocks.find(
      (b) =>
        b.type === "section" &&
        "text" in b &&
        b.text &&
        typeof b.text === "object" &&
        "text" in b.text &&
        typeof b.text.text === "string" &&
        b.text.text.startsWith(">"),
    ) as { text: { text: string } } | undefined;
    expect(bodySection).toBeDefined();
    // 1500 chars + "..." + "> " prefix = body must be shorter than the 2000 input
    expect(bodySection!.text.text.length).toBeLessThan(2000);
    expect(bodySection!.text.text).toContain("...");
  });
});

describe("buildDraftSentBlocks", () => {
  it("shows sent confirmation", () => {
    const blocks = buildDraftSentBlocks({
      recipient: "sender@example.com",
      subject: "Re: Meeting",
    });
    expect(blocks.some((b) => b.type === "context")).toBe(true);
  });
});

describe("buildDraftDismissedBlocks", () => {
  it("shows dismissed confirmation", () => {
    const blocks = buildDraftDismissedBlocks({
      recipient: "sender@example.com",
      subject: "Re: Meeting",
    });
    expect(blocks.some((b) => b.type === "context")).toBe(true);
  });
});
