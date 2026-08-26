import { describe, expect, it } from "vitest";
import {
  resolveComposeRecipientFields,
  resolveComposeRecipients,
} from "./compose-recipients";

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

  it("commits pending contact entries from every recipient field", () => {
    expect(
      resolveComposeRecipientFields({
        selectedRecipients: {
          to: "to@example.com",
          cc: "first-cc@example.com",
          bcc: undefined,
        },
        pendingRecipients: {
          to: "",
          cc: "second-cc@example.com",
          bcc: "bcc@example.com",
        },
      }),
    ).toEqual({
      to: "to@example.com",
      cc: "first-cc@example.com,second-cc@example.com",
      bcc: "bcc@example.com",
    });
  });
});
