import { describe, expect, it } from "vitest";
import {
  findReplySendAsAddress,
  formatSendAsAddress,
} from "@/utils/email/send-as";

const addresses = [
  { email: "me@example.com", isDefault: true },
  { email: "support@example.com", name: "Support", isDefault: false },
  { email: "sales@example.com", isDefault: false },
];

describe("findReplySendAsAddress", () => {
  it("picks the alias the message was sent to", () => {
    expect(
      findReplySendAsAddress(
        "Customer <customer@test.com>, Support <SUPPORT@example.com>",
        addresses,
      )?.email,
    ).toBe("support@example.com");
  });

  it("prefers the first matching address", () => {
    expect(
      findReplySendAsAddress(
        "sales@example.com, support@example.com",
        addresses,
      )?.email,
    ).toBe("sales@example.com");
  });

  it("falls back to the default address", () => {
    expect(findReplySendAsAddress("someone@test.com", addresses)?.email).toBe(
      "me@example.com",
    );
    expect(findReplySendAsAddress(undefined, addresses)?.email).toBe(
      "me@example.com",
    );
  });
});

describe("formatSendAsAddress", () => {
  it("quotes names so commas don't split the address", () => {
    expect(
      formatSendAsAddress({
        email: "support@example.com",
        name: 'Acme, "Help"',
        isDefault: false,
      }),
    ).toBe('"Acme, \\"Help\\"" <support@example.com>');
  });
});
