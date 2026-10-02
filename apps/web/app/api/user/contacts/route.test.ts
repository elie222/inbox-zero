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

import { ContactsAccessDeniedError } from "@/utils/email/contact";
import { GET } from "./route";

const callGet = (url: string) =>
  GET(new NextRequest(url), { params: Promise.resolve({}) });

describe("GET /api/user/contacts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envMock.NEXT_PUBLIC_CONTACTS_ENABLED = true;
  });

  it("searches contacts through the authenticated email provider", async () => {
    searchContactsMock.mockResolvedValue([
      { emailAddress: "contact@example.com", name: "Contact" },
    ]);

    const response = await callGet(
      "http://localhost:3000/api/user/contacts?query=contact%20name",
    );

    expect(searchContactsMock).toHaveBeenCalledWith("contact name");
    await expect(response.json()).resolves.toEqual({
      contacts: [{ emailAddress: "contact@example.com", name: "Contact" }],
      reconnectRequired: false,
    });
  });

  it("does not query the provider when contact suggestions are disabled", async () => {
    envMock.NEXT_PUBLIC_CONTACTS_ENABLED = false;

    const response = await callGet(
      "http://localhost:3000/api/user/contacts?query=contact",
    );

    expect(response.status).toBe(404);
    expect(searchContactsMock).not.toHaveBeenCalled();
  });

  it("offers a contact-specific reconnect for missing access", async () => {
    searchContactsMock.mockRejectedValue(new ContactsAccessDeniedError());

    const response = await callGet(
      "http://localhost:3000/api/user/contacts?query=contact",
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      contacts: [],
      reconnectRequired: true,
    });
  });

  it("propagates unrelated provider failures", async () => {
    searchContactsMock.mockRejectedValue(new Error("Provider exploded"));

    await expect(
      callGet("http://localhost:3000/api/user/contacts?query=contact"),
    ).rejects.toThrow("Provider exploded");
  });
});
