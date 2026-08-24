import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { envMock, searchContactsMock } = vi.hoisted(() => ({
  envMock: { NEXT_PUBLIC_CONTACTS_ENABLED: true },
  searchContactsMock: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: envMock,
}));

vi.mock("@/utils/middleware", () => ({
  withEmailProvider:
    (
      _scope: string,
      handler: (
        request: NextRequest & Record<string, unknown>,
        context: { params: Promise<Record<string, string>> },
      ) => Promise<Response>,
    ) =>
    (
      request: NextRequest,
      context: { params: Promise<Record<string, string>> },
    ) =>
      handler(
        Object.assign(request, {
          emailProvider: { searchContacts: searchContactsMock },
        }),
        context,
      ),
}));

import { GET } from "./route";

describe("GET /api/user/contacts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envMock.NEXT_PUBLIC_CONTACTS_ENABLED = true;
  });

  it("searches contacts through the authenticated email provider", async () => {
    searchContactsMock.mockResolvedValue([
      { emailAddress: "contact@example.com", name: "Contact" },
    ]);

    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/user/contacts?query=contact%20name",
      ),
      { params: Promise.resolve({}) },
    );

    expect(searchContactsMock).toHaveBeenCalledWith("contact name");
    await expect(response.json()).resolves.toEqual({
      contacts: [{ emailAddress: "contact@example.com", name: "Contact" }],
    });
  });

  it("does not query the provider when contact suggestions are disabled", async () => {
    envMock.NEXT_PUBLIC_CONTACTS_ENABLED = false;

    const response = await GET(
      new NextRequest("http://localhost:3000/api/user/contacts?query=contact"),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(404);
    expect(searchContactsMock).not.toHaveBeenCalled();
  });
});
