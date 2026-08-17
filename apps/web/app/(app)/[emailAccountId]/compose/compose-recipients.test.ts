import { describe, expect, it } from "vitest";
import { resolveComposeRecipients } from "./compose-recipients";

describe("resolveComposeRecipients", () => {
  it("commits a valid recipient that is still in the contact search input", () => {
    expect(
      resolveComposeRecipients({
        selectedRecipients: undefined,
        pendingRecipient: "recipient@example.com",
      }),
    ).toBe("recipient@example.com");
  });

  it("appends the pending recipient to committed recipients", () => {
    expect(
      resolveComposeRecipients({
        selectedRecipients: "first@example.com",
        pendingRecipient: " second@example.com ",
      }),
    ).toBe("first@example.com,second@example.com");
  });

  it("does not re-add a recipient already present with a display name", () => {
    expect(
      resolveComposeRecipients({
        selectedRecipients: '"Doe, John" <john@example.com>',
        pendingRecipient: "John@example.com",
      }),
    ).toBe('"Doe, John" <john@example.com>');
  });

  it("does not send incomplete contact search text", () => {
    expect(
      resolveComposeRecipients({
        selectedRecipients: "first@example.com",
        pendingRecipient: "second@",
      }),
    ).toBe("first@example.com");
  });
});
