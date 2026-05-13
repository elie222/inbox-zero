import { describe, expect, it } from "vitest";
import { stripInlineThreadIds } from "@/utils/ai/assistant/strip-inline-thread-ids";

describe("stripInlineThreadIds", () => {
  it("removes a parenthesized Gmail thread reference", () => {
    const input =
      "I also saw that recording from your team (thread 19d693041ceba74e). It seems like a good idea.";

    expect(stripInlineThreadIds(input)).toBe(
      "I also saw that recording from your team. It seems like a good idea.",
    );
  });

  it("removes a parenthesized thread id label form", () => {
    const input = "Found one match (threadId: 19d693041ceba74e).";

    expect(stripInlineThreadIds(input)).toBe("Found one match.");
  });

  it("removes an inline thread reference without parentheses", () => {
    const input = "Open thread 19d693041ceba74e for context.";

    expect(stripInlineThreadIds(input)).toBe("Open for context.");
  });

  it("removes long Outlook-style ids", () => {
    const input =
      "See the trip notes (thread AAQkAGI1ZTM3ZjAwLTUzNjQtNGMzNi04ZTQ4LTQ4MmNkNzg4N2ZlNQAQAA1=). It mentions Friday.";

    expect(stripInlineThreadIds(input)).toBe(
      "See the trip notes. It mentions Friday.",
    );
  });

  it("removes a message id reference", () => {
    const input = "Check the invoice (messageId 19d693041ceba74e) for details.";

    expect(stripInlineThreadIds(input)).toBe("Check the invoice for details.");
  });

  it("removes multiple references in one string", () => {
    const input =
      "Two emails (thread 19d693041ceba74e) and (thread 18c592030bcda63d) match.";

    expect(stripInlineThreadIds(input)).toBe("Two emails and match.");
  });

  it("leaves text without thread ids untouched", () => {
    const input = "Started a new thread about the project plan.";

    expect(stripInlineThreadIds(input)).toBe(input);
  });

  it("does not strip the threadid attribute inside email tags", () => {
    const input =
      '<emails>\n<email threadid="19d693041ceba74e">Trip notes</email>\n</emails>';

    expect(stripInlineThreadIds(input)).toBe(input);
  });

  it("leaves short ambiguous tokens alone", () => {
    const input = "Reply in thread 5 or thread A.";

    expect(stripInlineThreadIds(input)).toBe(input);
  });
});
