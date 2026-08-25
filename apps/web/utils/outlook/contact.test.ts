import { describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import { searchContacts } from "./contact";

describe("searchContacts", () => {
  it("searches relevant Outlook people and maps their scored addresses", async () => {
    const get = vi.fn().mockResolvedValue({
      value: [
        {
          displayName: "First Contact",
          scoredEmailAddresses: [
            { address: "first@example.com" },
            { address: "alternate@example.com" },
          ],
        },
        {
          displayName: "Fallback Contact",
          userPrincipalName: "fallback@example.com",
        },
      ],
    });
    const top = vi.fn().mockReturnValue({ get });
    const search = vi.fn().mockReturnValue({ top });
    const select = vi.fn().mockReturnValue({ search, top });
    const api = vi.fn().mockReturnValue({ select });

    const result = await searchContacts(
      { getClient: () => ({ api }) } as never,
      "first",
      createTestLogger(),
    );

    expect(api).toHaveBeenCalledWith("/me/people");
    expect(select).toHaveBeenCalledWith(
      "displayName,scoredEmailAddresses,userPrincipalName",
    );
    expect(search).toHaveBeenCalledWith("first");
    expect(top).toHaveBeenCalledWith(10);
    expect(result).toEqual([
      { emailAddress: "first@example.com", name: "First Contact" },
      { emailAddress: "alternate@example.com", name: "First Contact" },
      { emailAddress: "fallback@example.com", name: "Fallback Contact" },
    ]);
  });

  it("loads the most relevant people before a search is entered", async () => {
    const get = vi.fn().mockResolvedValue({ value: [] });
    const top = vi.fn().mockReturnValue({ get });
    const search = vi.fn();
    const select = vi.fn().mockReturnValue({ search, top });
    const api = vi.fn().mockReturnValue({ select });

    await searchContacts(
      { getClient: () => ({ api }) } as never,
      "  ",
      createTestLogger(),
    );

    expect(search).not.toHaveBeenCalled();
    expect(top).toHaveBeenCalledWith(10);
  });
});
