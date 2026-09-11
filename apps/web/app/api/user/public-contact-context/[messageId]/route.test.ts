import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getEmailAccountMock, getMessageMock, getPublicContactContextMock } =
  vi.hoisted(() => ({
    getEmailAccountMock: vi.fn(),
    getMessageMock: vi.fn(),
    getPublicContactContextMock: vi.fn(),
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
          auth: {
            emailAccountId: "account-1",
            email: "owner@inboxzero.com",
          },
          emailProvider: { getMessage: getMessageMock },
        }),
        context,
      ),
}));

vi.mock("@/utils/user/get", () => ({
  getEmailAccountWithAi: getEmailAccountMock,
}));

vi.mock("@/utils/ai/public-contact-context", () => ({
  getPublicContactContext: getPublicContactContextMock,
}));

import { GET } from "./route";

describe("GET /api/user/public-contact-context/[messageId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEmailAccountMock.mockResolvedValue({ id: "account-1" });
    getPublicContactContextMock.mockResolvedValue({
      status: "unavailable",
      reason: "not_found",
    });
    getMessageMock.mockResolvedValue({
      headers: {
        from: "John Smith <john@acme.com>",
        to: "owner@inboxzero.com",
      },
    });
  });

  it("derives the researched identity from the authenticated message", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/user/public-contact-context/message-1?email=attacker@example.com",
      ),
      { params: Promise.resolve({ messageId: "message-1" }) },
    );

    expect(response.status).toBe(200);
    expect(getMessageMock).toHaveBeenCalledWith("message-1");
    expect(getPublicContactContextMock).toHaveBeenCalledWith({
      email: "john@acme.com",
      name: "John Smith",
      emailAccount: { id: "account-1" },
    });
    expect(getPublicContactContextMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ email: "attacker@example.com" }),
    );
  });

  it("does not research the authenticated user's own address", async () => {
    getMessageMock.mockResolvedValue({
      headers: {
        from: "owner@inboxzero.com",
        to: "owner@inboxzero.com",
      },
    });

    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/user/public-contact-context/message-1",
      ),
      { params: Promise.resolve({ messageId: "message-1" }) },
    );

    await expect(response.json()).resolves.toEqual({
      status: "unavailable",
      reason: "not_found",
    });
    expect(getPublicContactContextMock).not.toHaveBeenCalled();
  });
});
