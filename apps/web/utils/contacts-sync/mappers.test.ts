import { describe, expect, it } from "vitest";
import {
  contactToPersonPayload,
  mapPersonToContact,
} from "@/utils/contacts-sync/mappers";

describe("mapPersonToContact", () => {
  it("maps a full person, preferring primary values", () => {
    const result = mapPersonToContact({
      resourceName: "people/c123",
      etag: "etag-1",
      names: [
        { displayName: "Old Name" },
        { displayName: "Jane Doe", metadata: { primary: true } },
      ],
      emailAddresses: [
        { value: "old@example.com" },
        { value: "Jane@Example.com ", metadata: { primary: true } },
      ],
      phoneNumbers: [
        { value: "+1 555 0111", type: "work" },
        { value: "+1 555 0100", type: "mobile", metadata: { primary: true } },
      ],
      organizations: [
        { name: "Example Corp", title: "CTO", metadata: { primary: true } },
      ],
      photos: [
        { url: "https://g/default.png", default: true },
        { url: "https://g/jane.png" },
      ],
    });

    expect(result).toEqual({
      resourceName: "people/c123",
      etag: "etag-1",
      email: "jane@example.com",
      name: "Jane Doe",
      phones: [
        { label: "Mobile", value: "+1 555 0100" },
        { label: "Work", value: "+1 555 0111" },
      ],
      title: "CTO",
      companyName: "Example Corp",
      photoUrl: "https://g/jane.png",
      deleted: false,
    });
  });

  it("falls back to the first entry when nothing is marked primary", () => {
    const result = mapPersonToContact({
      resourceName: "people/c1",
      emailAddresses: [{ value: "a@b.com" }, { value: "c@d.com" }],
    });
    expect(result?.email).toBe("a@b.com");
  });

  it("returns null for people without an email (nothing to key on)", () => {
    expect(
      mapPersonToContact({
        resourceName: "people/c1",
        names: [{ displayName: "No Email" }],
      }),
    ).toBe(null);
  });

  it("maps deletions even without an email", () => {
    const result = mapPersonToContact({
      resourceName: "people/c1",
      metadata: { deleted: true },
    });
    expect(result).toMatchObject({ deleted: true, email: "" });
  });
});

describe("contactToPersonPayload", () => {
  it("builds the Google person payload from contact fields", () => {
    expect(
      contactToPersonPayload({
        email: "jane@example.com",
        name: "Jane Doe",
        phones: [
          { label: "Mobile", value: "+1 555 0100" },
          { label: "Office", value: "+1 555 0111" },
        ],
        title: "CTO",
        companyName: "Example Corp",
      }),
    ).toEqual({
      names: [{ unstructuredName: "Jane Doe" }],
      emailAddresses: [{ value: "jane@example.com" }],
      phoneNumbers: [
        { value: "+1 555 0100", type: "mobile" },
        { value: "+1 555 0111", type: "work" },
      ],
      organizations: [{ title: "CTO", name: "Example Corp" }],
    });
  });

  it("omits empty field groups so Google clears them", () => {
    expect(
      contactToPersonPayload({
        email: "jane@example.com",
        name: null,
        phones: [],
        title: null,
      }),
    ).toEqual({
      names: [],
      emailAddresses: [{ value: "jane@example.com" }],
      phoneNumbers: [],
      organizations: [],
    });
  });
});
