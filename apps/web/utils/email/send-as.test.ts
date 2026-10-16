import { describe, expect, it } from "vitest";
import {
  findReplySendAsAddress,
  formatSendAsAddress,
  getSendAsSignatureHtml,
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

describe("getSendAsSignatureHtml", () => {
  const withSignatures = [
    { email: "me@example.com", isDefault: true, signature: "<p>Me</p>" },
    {
      email: "support@example.com",
      isDefault: false,
      signature: "<p>Support</p>",
    },
    { email: "sales@example.com", isDefault: false },
  ];

  it("keeps the provider's default signature when none is set in the app", () => {
    expect(getSendAsSignatureHtml(undefined, withSignatures, "")).toBe(
      "<p>Me</p>",
    );
    expect(getSendAsSignatureHtml(withSignatures[0], withSignatures, "")).toBe(
      "<p>Me</p>",
    );
  });

  it("prefers the signature set in the app for the default address", () => {
    expect(
      getSendAsSignatureHtml(withSignatures[0], withSignatures, "<p>App</p>"),
    ).toBe("<p>App</p>");
  });

  it("uses an alias's own signature", () => {
    expect(
      getSendAsSignatureHtml(withSignatures[1], withSignatures, "<p>App</p>"),
    ).toBe("<p>Support</p>");
  });

  it("does not give an alias without a signature the default address's one", () => {
    expect(getSendAsSignatureHtml(withSignatures[2], withSignatures, "")).toBe(
      "",
    );
  });
});
