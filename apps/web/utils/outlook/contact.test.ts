import { describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import { searchContacts } from "./contact";

describe("searchContacts", () => {
  it("loads saved Outlook contacts and maps all usable addresses", async () => {
    const get = vi.fn().mockResolvedValue({
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
    });
    const top = vi.fn().mockReturnValue({ get });
    const select = vi.fn().mockReturnValue({ top });
    const api = vi.fn().mockReturnValue({ select });

    const result = await searchContacts(
      { getClient: () => ({ api }) } as never,
      "first",
      createTestLogger(),
    );

    expect(api).toHaveBeenCalledWith("/me/contacts");
    expect(select).toHaveBeenCalledWith("displayName,emailAddresses");
    expect(top).toHaveBeenCalledWith(50);
    expect(result).toEqual([
      { emailAddress: "first@example.com", name: "First Contact" },
      { emailAddress: "alternate@example.com", name: "First Contact" },
    ]);
  });

  it("loads saved contacts before a search is entered", async () => {
    const get = vi.fn().mockResolvedValue({ value: [] });
    const top = vi.fn().mockReturnValue({ get });
    const select = vi.fn().mockReturnValue({ top });
    const api = vi.fn().mockReturnValue({ select });

    await searchContacts(
      { getClient: () => ({ api }) } as never,
      "  ",
      createTestLogger(),
    );

    expect(api).toHaveBeenCalledWith("/me/contacts");
    expect(top).toHaveBeenCalledWith(50);
  });

  it("continues through saved contact pages until it finds a match", async () => {
    const nextLink =
      "https://graph.microsoft.com/v1.0/me/contacts?$skiptoken=next";
    const firstGet = vi.fn().mockResolvedValue({
      value: [
        {
          displayName: "Other Contact",
          emailAddresses: [{ address: "other@example.com" }],
        },
      ],
      "@odata.nextLink": nextLink,
    });
    const secondGet = vi.fn().mockResolvedValue({
      value: [
        {
          displayName: "Target Contact",
          emailAddresses: [{ address: "target@example.com" }],
        },
      ],
    });
    const top = vi.fn().mockReturnValue({ get: firstGet });
    const select = vi.fn().mockReturnValue({ top });
    const api = vi.fn((endpoint: string) =>
      endpoint === "/me/contacts" ? { select } : { get: secondGet },
    );

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
    const get = vi.fn().mockResolvedValue({
      value: [
        {
          displayName: "Other Contact",
          emailAddresses: [{ address: "other@example.com" }],
        },
      ],
      "@odata.nextLink": nextLink,
    });
    const top = vi.fn().mockReturnValue({ get });
    const select = vi.fn().mockReturnValue({ top });
    const api = vi.fn((endpoint: string) =>
      endpoint === "/me/contacts" ? { select } : { get },
    );

    const result = await searchContacts(
      { getClient: () => ({ api }) } as never,
      "no-such-contact",
      createTestLogger(),
    );

    expect(get).toHaveBeenCalledTimes(20);
    expect(result).toEqual([]);
  });
});
