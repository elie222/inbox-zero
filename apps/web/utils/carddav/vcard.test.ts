import { describe, expect, it } from "vitest";
import { generateVCard, parseVCard } from "@/utils/carddav/vcard";

describe("generateVCard", () => {
  it("produces a vCard 3.0 with all fields", () => {
    const vcard = generateVCard({
      uid: "abc-123",
      email: "jane@example.com",
      name: "Jane van Doe",
      phones: [
        { label: "Mobile", value: "+1 555 0100" },
        { label: "Work", value: "+1 555 0111" },
      ],
      title: "CTO",
      companyName: "Example, Corp",
      updatedAt: new Date("2026-07-24T12:00:00Z"),
    });

    expect(vcard).toContain("BEGIN:VCARD\r\nVERSION:3.0");
    expect(vcard).toContain("UID:abc-123");
    expect(vcard).toContain("FN:Jane van Doe");
    expect(vcard).toContain("N:Doe;Jane van;;;");
    expect(vcard).toContain("EMAIL;TYPE=INTERNET:jane@example.com");
    expect(vcard).toContain("TEL;TYPE=CELL:+1 555 0100");
    expect(vcard).toContain("TEL;TYPE=WORK:+1 555 0111");
    expect(vcard).toContain("ORG:Example\\, Corp");
    expect(vcard).toContain("TITLE:CTO");
    expect(vcard.endsWith("END:VCARD\r\n")).toBe(true);
  });

  it("falls back to the email as display name", () => {
    const vcard = generateVCard({
      uid: "u1",
      email: "x@y.com",
      name: null,
      phones: [],
      title: null,
      companyName: null,
      updatedAt: new Date(),
    });
    expect(vcard).toContain("FN:x@y.com");
    expect(vcard).not.toContain("TEL");
    expect(vcard).not.toContain("ORG");
  });
});

describe("parseVCard", () => {
  it("round-trips a generated vCard", () => {
    const vcard = generateVCard({
      uid: "abc-123",
      email: "jane@example.com",
      name: "Jane Doe",
      phones: [
        { label: "Mobile", value: "+1 555 0100" },
        { label: "Fax", value: "+1 555 0199" },
      ],
      title: "CTO",
      companyName: "Example, Corp",
      updatedAt: new Date(),
    });

    expect(parseVCard(vcard)).toEqual({
      uid: "abc-123",
      email: "jane@example.com",
      name: "Jane Doe",
      phones: [
        { label: "Mobile", value: "+1 555 0100" },
        { label: "Fax", value: "+1 555 0199" },
      ],
      title: "CTO",
      companyName: "Example, Corp",
    });
  });

  it("parses an iOS-style card with folded lines and params", () => {
    const raw = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "PRODID:-//Apple Inc.//iOS 19.0//EN",
      "N:Ortiz;Tom;;;",
      "FN:Tom",
      "  Ortiz",
      "ORG:Vercel;Platform",
      "EMAIL;type=INTERNET;type=WORK;type=pref:Tom@Vercel.app",
      "TEL;type=CELL;type=VOICE;type=pref:+1 (555) 010-0000",
      "UID:1D0C50F1-6E9A-4C6F-9F1C-000000000000",
      "END:VCARD",
    ].join("\r\n");

    expect(parseVCard(raw)).toEqual({
      uid: "1D0C50F1-6E9A-4C6F-9F1C-000000000000",
      email: "tom@vercel.app",
      name: "Tom Ortiz",
      phones: [{ label: "Mobile", value: "+1 (555) 010-0000" }],
      title: null,
      companyName: "Vercel",
    });
  });
});
