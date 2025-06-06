import { describe, it, expect } from "vitest";
import { snippetRemoveReply } from "./snippet";

describe("snippetRemoveReply", () => {
  it("should return the string before 'On DAY'", () => {
    const snippet = "This is a test email. On Monday, we will meet.";
    const result = snippetRemoveReply(snippet);
    expect(result).toBe(snippet);
  });

  it("should return the entire string if 'On DAY' is not present", () => {
    const snippet = "This is a test email without a day.";
    const result = snippetRemoveReply(snippet);
    expect(result).toBe("This is a test email without a day.");
  });

  it("should return an empty string if the input is null", () => {
    const result = snippetRemoveReply(null);
    expect(result).toBe("");
  });

  it("should return an empty string if the input is undefined", () => {
    const result = snippetRemoveReply(undefined);
    expect(result).toBe("");
  });

  it("should not handle case insensitivity", () => {
    const snippet = "This is a test email. on tuesday, we will meet.";
    const result = snippetRemoveReply(snippet);
    expect(result).toBe("This is a test email. on tuesday, we will meet.");
  });

  it("should match abbreviated day names", () => {
    const snippet =
      "Done Best, Alice On Tue, Feb 04, 2025 at 10:00 AM, Bob <example@gmail.com> wrote: Lmk if you sent it";
    const result = snippetRemoveReply(snippet);
    expect(result).toBe("Done Best, Alice");
  });

  it("should not match full day names", () => {
    const snippet =
      "Done Best, Alice On Tuesday, Feb 04, 2025 at 10:00 AM, Bob <example@gmail.com> wrote: Lmk if you sent it";
    const result = snippetRemoveReply(snippet);
    expect(result).toBe(snippet);
  });
});
