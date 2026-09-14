import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";

const envMock = vi.hoisted(() => ({
  NEXT_PUBLIC_GMAIL_OTHER_CONTACTS_ENABLED: true,
}));

vi.mock("@/env", () => ({
  env: envMock,
}));

import { searchContacts } from "./contact";

describe("searchContacts", () => {
  beforeEach(() => {
    envMock.NEXT_PUBLIC_GMAIL_OTHER_CONTACTS_ENABLED = true;
  });

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
    const { client, searchOtherContactsMock } = createPeopleClient({
      searchContactsMock,
    });

    const result = await searchContacts(client, "first", createTestLogger());

    expect(searchContactsMock).toHaveBeenCalledWith({
      query: "first",
      readMask: "names,emailAddresses,photos",
      pageSize: 10,
    });
    expect(searchOtherContactsMock).toHaveBeenCalledWith({
      query: "first",
      readMask: "names,emailAddresses",
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

  it("includes people from Gmail other contacts alongside saved contacts", async () => {
    const { client } = createPeopleClient({
      searchContactsMock: vi.fn().mockResolvedValue({
        data: {
          results: [
            {
              person: {
                names: [{ displayName: "Saved Contact" }],
                emailAddresses: [{ value: "saved@example.com" }],
              },
            },
          ],
        },
      }),
      searchOtherContactsMock: vi.fn().mockResolvedValue({
        data: {
          results: [
            {
              person: {
                names: [{ displayName: "Recent Correspondent" }],
                emailAddresses: [{ value: "recent@example.com" }],
              },
            },
          ],
        },
      }),
    });

    const result = await searchContacts(client, "re", createTestLogger());

    expect(result).toEqual([
      {
        emailAddress: "saved@example.com",
        name: "Saved Contact",
        profilePictureUrl: undefined,
      },
      {
        emailAddress: "recent@example.com",
        name: "Recent Correspondent",
        profilePictureUrl: undefined,
      },
    ]);
  });

  it("falls back to other contacts when saved contacts are not permitted", async () => {
    const { client } = createPeopleClient({
      searchContactsMock: vi.fn().mockRejectedValue(
        Object.assign(
          new Error("Request had insufficient authentication scopes."),
          {
            errors: [{ reason: "insufficientPermissions" }],
          },
        ),
      ),
      searchOtherContactsMock: vi.fn().mockResolvedValue({
        data: {
          results: [
            {
              person: {
                names: [{ displayName: "Recent Correspondent" }],
                emailAddresses: [{ value: "recent@example.com" }],
              },
            },
          ],
        },
      }),
    });

    await expect(
      searchContacts(client, "re", createTestLogger()),
    ).resolves.toEqual([
      {
        emailAddress: "recent@example.com",
        name: "Recent Correspondent",
        profilePictureUrl: undefined,
      },
    ]);
  });

  it("still returns saved contacts when other contacts are not permitted", async () => {
    const { client } = createPeopleClient({
      searchContactsMock: vi.fn().mockResolvedValue({
        data: {
          results: [
            {
              person: {
                names: [{ displayName: "Saved Contact" }],
                emailAddresses: [{ value: "saved@example.com" }],
              },
            },
          ],
        },
      }),
      searchOtherContactsMock: vi.fn().mockRejectedValue({
        status: "PERMISSION_DENIED",
        message: "Request had insufficient authentication scopes.",
      }),
    });

    await expect(
      searchContacts(client, "sa", createTestLogger()),
    ).resolves.toEqual([
      {
        emailAddress: "saved@example.com",
        name: "Saved Contact",
        profilePictureUrl: undefined,
      },
    ]);
  });

  it("throws when neither Gmail contact source is permitted", async () => {
    const savedError = Object.assign(new Error("Access denied"), {
      errors: [{ reason: "insufficientPermissions" }],
    });
    const { client } = createPeopleClient({
      searchContactsMock: vi.fn().mockRejectedValue(savedError),
      searchOtherContactsMock: vi.fn().mockRejectedValue({
        status: "PERMISSION_DENIED",
      }),
    });

    await expect(
      searchContacts(client, "contact", createTestLogger()),
    ).rejects.toBe(savedError);
  });

  it("does not treat a Gmail rate-limit as missing contact access", async () => {
    const rateLimitError = Object.assign(new Error("Rate Limit Exceeded"), {
      errors: [{ reason: "userRateLimitExceeded" }],
      code: 403,
    });
    const { client } = createPeopleClient({
      searchContactsMock: vi.fn().mockRejectedValue(rateLimitError),
    });

    await expect(
      searchContacts(client, "contact", createTestLogger()),
    ).rejects.toBe(rateLimitError);
  });

  it.each([
    "rateLimitExceeded",
    "userRateLimitExceeded",
    "quotaExceeded",
  ] as const)("does not treat a nested %s PERMISSION_DENIED error as missing contact access", async (reason) => {
    const rateLimitError = Object.assign(new Error("Rate Limit Exceeded"), {
      errors: [{ reason }],
      code: 403,
      status: "PERMISSION_DENIED",
      response: {
        data: {
          error: {
            code: 403,
            message: "Rate Limit Exceeded",
            errors: [{ reason }],
            status: "PERMISSION_DENIED",
          },
        },
      },
    });
    const { client } = createPeopleClient({
      searchContactsMock: vi.fn().mockRejectedValue(rateLimitError),
    });

    await expect(
      searchContacts(client, "contact", createTestLogger()),
    ).rejects.toBe(rateLimitError);
  });

  it("does not search Other Contacts when that flag is off", async () => {
    envMock.NEXT_PUBLIC_GMAIL_OTHER_CONTACTS_ENABLED = false;
    const { client, searchContactsMock, searchOtherContactsMock } =
      createPeopleClient({
        searchContactsMock: vi.fn().mockResolvedValue({
          data: {
            results: [
              {
                person: {
                  names: [{ displayName: "Saved Contact" }],
                  emailAddresses: [{ value: "saved@example.com" }],
                },
              },
            ],
          },
        }),
      });

    await expect(
      searchContacts(client, "sa", createTestLogger()),
    ).resolves.toEqual([
      {
        emailAddress: "saved@example.com",
        name: "Saved Contact",
        profilePictureUrl: undefined,
      },
    ]);
    expect(searchContactsMock).toHaveBeenCalled();
    expect(searchOtherContactsMock).not.toHaveBeenCalled();
  });
});

function createPeopleClient({
  searchContactsMock = vi.fn().mockResolvedValue({ data: { results: [] } }),
  searchOtherContactsMock = vi.fn().mockResolvedValue({
    data: { results: [] },
  }),
}: {
  searchContactsMock?: ReturnType<typeof vi.fn>;
  searchOtherContactsMock?: ReturnType<typeof vi.fn>;
} = {}) {
  return {
    client: {
      people: { searchContacts: searchContactsMock },
      otherContacts: { search: searchOtherContactsMock },
    } as never,
    searchContactsMock,
    searchOtherContactsMock,
  };
}
