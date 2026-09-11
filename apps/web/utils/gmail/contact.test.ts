import { describe, expect, it, vi } from "vitest";
import { searchContacts } from "./contact";

describe("searchContacts", () => {
  it("maps all usable Google contact addresses to compose suggestions", async () => {
    const searchContactsMock = vi.fn().mockResolvedValue({
      data: {
        results: [
          {
            person: {
              names: [{ displayName: "First Contact" }],
              emailAddresses: [
                { value: "first@example.com" },
                { value: "alternate@example.com" },
              ],
              photos: [{ url: "https://example.com/photo.jpg" }],
            },
          },
          { person: { emailAddresses: [{ value: "invalid" }] } },
        ],
      },
    });

    const result = await searchContacts(
      { people: { searchContacts: searchContactsMock } } as never,
      "first",
    );

    expect(searchContactsMock).toHaveBeenCalledWith({
      query: "first",
      readMask: "names,emailAddresses,photos",
      pageSize: 10,
    });
    expect(result).toEqual([
      {
        emailAddress: "first@example.com",
        name: "First Contact",
        profilePictureUrl: "https://example.com/photo.jpg",
      },
      {
        emailAddress: "alternate@example.com",
        name: "First Contact",
        profilePictureUrl: "https://example.com/photo.jpg",
      },
    ]);
  });
});
