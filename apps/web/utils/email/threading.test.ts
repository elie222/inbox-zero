import { describe, it, expect } from "vitest";
import { buildThreadingHeaders } from "./threading";

describe("buildThreadingHeaders", () => {
  it("returns empty strings when headerMessageId is empty", () => {
    const result = buildThreadingHeaders({ headerMessageId: "" });
    expect(result).toEqual({ inReplyTo: "", references: "" });
  });

  it("returns empty strings when headerMessageId is falsy", () => {
    const result = buildThreadingHeaders({
      headerMessageId: undefined as unknown as string,
    });
    expect(result).toEqual({ inReplyTo: "", references: "" });
  });

  it("uses headerMessageId for both fields when no references provided", () => {
    const messageId = "<abc123@example.com>";
    const result = buildThreadingHeaders({ headerMessageId: messageId });

    expect(result).toEqual({
      inReplyTo: messageId,
      references: messageId,
    });
  });

  it("appends headerMessageId to existing references (RFC 5322)", () => {
    const messageId = "<msg3@example.com>";
    const existingRefs = "<msg1@example.com> <msg2@example.com>";

    const result = buildThreadingHeaders({
      headerMessageId: messageId,
      references: existingRefs,
    });

    expect(result).toEqual({
      inReplyTo: messageId,
      references: "<msg1@example.com> <msg2@example.com> <msg3@example.com>",
    });
  });

  it("handles references with trailing whitespace", () => {
    const messageId = "<msg2@example.com>";
    const existingRefs = "<msg1@example.com>  "; // trailing spaces

    const result = buildThreadingHeaders({
      headerMessageId: messageId,
      references: existingRefs,
    });

    // .trim() should clean up the result
    expect(result.references).toBe(
      "<msg1@example.com>   <msg2@example.com>".trim(),
    );
  });

  it("handles empty string references", () => {
    const messageId = "<abc@example.com>";
    const result = buildThreadingHeaders({
      headerMessageId: messageId,
      references: "",
    });

    // Empty string is falsy, so should use headerMessageId only
    expect(result).toEqual({
      inReplyTo: messageId,
      references: messageId,
    });
  });
});
