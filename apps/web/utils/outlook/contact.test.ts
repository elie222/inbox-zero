import { describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import { searchContacts } from "./contact";

describe("searchContacts", () => {
  it("loads saved Outlook contacts and maps all usable addresses", async () => {
    const { api } = createGraphClient({
      contactPages: [
        {
          value: [
            {
              displayName: "First Contact",
              emailAddresses: [
                { address: "first@example.com", name: "First Contact" },
                { address: "alternate@example.com", name: "Alternate" },
              ],
            },
            {
              displayName: "Fallback Contact",
              emailAddresses: [{ address: "fallback@example.com" }],
            },
          ],
        },
      ],
    });

    const result = await searchContacts(
      { getClient: () => ({ api }) } as never,
      "first",
      createTestLogger(),
    );

    expect(api).toHaveBeenCalledWith("/me/contacts");
    expect(result).toEqual([
      { emailAddress: "first@example.com", name: "First Contact" },
      { emailAddress: "alternate@example.com", name: "First Contact" },
    ]);
  });

  it("includes relevant people alongside saved contacts", async () => {
    const { api } = createGraphClient({
      contactPages: [
        {
          value: [
            {
              displayName: "Saved Contact",
              emailAddresses: [{ address: "saved@example.com" }],
            },
          ],
        },
      ],
      people: [
        {
          displayName: "Directory Person",
          scoredEmailAddresses: [{ address: "directory@example.com" }],
        },
      ],
    });

    const result = await searchContacts(
      { getClient: () => ({ api }) } as never,
      "",
      createTestLogger(),
    );

    expect(api).toHaveBeenCalledWith("/me/people");
    expect(result).toEqual([
      { emailAddress: "saved@example.com", name: "Saved Contact" },
      { emailAddress: "directory@example.com", name: "Directory Person" },
    ]);
  });

  it("falls back to relevant people when saved contacts are not permitted", async () => {
    const { api } = createGraphClient({
      contactsError: Object.assign(new Error("Access is denied"), {
        code: "ErrorAccessDenied",
      }),
      people: [
        {
          displayName: "Directory Person",
          userPrincipalName: "directory@example.com",
        },
      ],
    });

    const result = await searchContacts(
      { getClient: () => ({ api }) } as never,
      "directory",
      createTestLogger(),
    );

    expect(result).toEqual([
      { emailAddress: "directory@example.com", name: "Directory Person" },
    ]);
  });

  it("still returns saved contacts when the people source is not permitted", async () => {
    const { api } = createGraphClient({
      contactPages: [
        {
          value: [
            {
              displayName: "Saved Contact",
              emailAddresses: [{ address: "saved@example.com" }],
            },
          ],
        },
      ],
      peopleError: Object.assign(new Error("Forbidden"), { statusCode: 403 }),
    });

    const result = await searchContacts(
      { getClient: () => ({ api }) } as never,
      "saved",
      createTestLogger(),
    );

    expect(result).toEqual([
      { emailAddress: "saved@example.com", name: "Saved Contact" },
    ]);
  });

  it("reports missing access only when neither source is permitted", async () => {
    const contactsError = Object.assign(new Error("Access is denied"), {
      code: "ErrorAccessDenied",
    });
    const { api } = createGraphClient({
      contactsError,
      peopleError: Object.assign(new Error("Forbidden"), { statusCode: 403 }),
    });

    await expect(
      searchContacts(
        { getClient: () => ({ api }) } as never,
        "anyone",
        createTestLogger(),
      ),
    ).rejects.toBe(contactsError);
  });

  it("surfaces non-permission failures instead of returning partial results", async () => {
    const { api } = createGraphClient({
      contactsError: Object.assign(new Error("Malformed request"), {
        statusCode: 400,
      }),
      people: [
        {
          displayName: "Directory Person",
          scoredEmailAddresses: [{ address: "directory@example.com" }],
        },
      ],
    });

    await expect(
      searchContacts(
        { getClient: () => ({ api }) } as never,
        "anyone",
        createTestLogger(),
      ),
    ).rejects.toThrow("Malformed request");
  });

  it("continues through saved contact pages until it finds a match", async () => {
    const nextLink =
      "https://graph.microsoft.com/v1.0/me/contacts?$skiptoken=next";
    const { api } = createGraphClient({
      contactPages: [
        {
          value: [
            {
              displayName: "Other Contact",
              emailAddresses: [{ address: "other@example.com" }],
            },
          ],
          "@odata.nextLink": nextLink,
        },
        {
          value: [
            {
              displayName: "Target Contact",
              emailAddresses: [{ address: "target@example.com" }],
            },
          ],
        },
      ],
    });

    const result = await searchContacts(
      { getClient: () => ({ api }) } as never,
      "target",
      createTestLogger(),
    );

    expect(api).toHaveBeenCalledWith(nextLink);
    expect(result).toEqual([
      { emailAddress: "target@example.com", name: "Target Contact" },
    ]);
  });

  it("stops paging after the max page count when nothing matches", async () => {
    const nextLink =
      "https://graph.microsoft.com/v1.0/me/contacts?$skiptoken=next";
    const contactsGet = vi.fn().mockResolvedValue({
      value: [
        {
          displayName: "Other Contact",
          emailAddresses: [{ address: "other@example.com" }],
        },
      ],
      "@odata.nextLink": nextLink,
    });
    const { api } = createGraphClient({ contactsGet });

    const result = await searchContacts(
      { getClient: () => ({ api }) } as never,
      "no-such-contact",
      createTestLogger(),
    );

    expect(contactsGet).toHaveBeenCalledTimes(20);
    expect(result).toEqual([]);
  });
});

// Mimics the Graph client's fluent builder so tests describe API responses
// rather than the chain of select/top/search calls used to reach them.
function createGraphClient({
  contactPages = [],
  contactsGet,
  contactsError,
  people = [],
  peopleError,
}: {
  contactPages?: unknown[];
  contactsGet?: ReturnType<typeof vi.fn>;
  contactsError?: unknown;
  people?: unknown[];
  peopleError?: unknown;
}) {
  let pageIndex = 0;
  const defaultContactsGet = vi.fn(() => {
    if (contactsError) return Promise.reject(contactsError);
    return Promise.resolve(contactPages[pageIndex++] ?? { value: [] });
  });
  const nextContactsPage = contactsGet ?? defaultContactsGet;

  const peopleGet = vi.fn(() => {
    if (peopleError) return Promise.reject(peopleError);
    return Promise.resolve({ value: people });
  });

  const builder = (get: ReturnType<typeof vi.fn>) => {
    const chain: Record<string, unknown> = { get };
    for (const method of ["select", "top", "search"]) {
      chain[method] = vi.fn(() => chain);
    }
    return chain;
  };

  const api = vi.fn((endpoint: string) =>
    endpoint === "/me/people"
      ? builder(peopleGet)
      : builder(nextContactsPage as ReturnType<typeof vi.fn>),
  );

  return { api };
}
