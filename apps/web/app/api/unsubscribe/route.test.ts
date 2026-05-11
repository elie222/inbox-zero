import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

vi.mock("@/utils/prisma");

vi.mock("@/utils/middleware", () => ({
  withError:
    (
      _scope: string,
      handler: (request: Request & { logger?: unknown }) => Promise<Response>,
    ) =>
    (request: Request & { logger?: unknown }) =>
      handler(request),
}));

import { GET, POST } from "./route";

describe("unsubscribe route", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prisma.emailToken.findUnique.mockResolvedValue({
      id: "email-token-1",
      token: "valid-token",
      emailAccountId: "email-account-1",
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      emailAccount: {
        id: "email-account-1",
        email: "user@example.com",
      },
    } as Awaited<ReturnType<typeof prisma.emailToken.findUnique>>);

    prisma.emailAccount.update.mockResolvedValue({} as never);
    prisma.emailToken.delete.mockResolvedValue({} as never);
  });

  it("renders a confirmation page on GET without consuming the token", async () => {
    const request = new Request(
      "https://example.com/api/unsubscribe?token=valid-token",
    );

    const response = await GET(request as never);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(body).toContain("Confirm unsubscribe");
    expect(body).toContain('method="POST"');
    expect(prisma.emailAccount.update).not.toHaveBeenCalled();
    expect(prisma.emailToken.delete).not.toHaveBeenCalled();
  });

  it("consumes the token on form POST", async () => {
    const request = Object.assign(
      new Request("https://example.com/api/unsubscribe", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ token: "valid-token" }),
      }),
      {
        logger: {
          error: vi.fn(),
          info: vi.fn(),
        },
      },
    );

    const response = await POST(request as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(prisma.emailAccount.update).toHaveBeenCalledTimes(1);
    expect(prisma.emailToken.delete).toHaveBeenCalledTimes(1);
  });

  it("supports one-click POSTs with the token kept in the query string", async () => {
    const request = Object.assign(
      new Request("https://example.com/api/unsubscribe?token=valid-token", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body: "List-Unsubscribe=One-Click",
      }),
      {
        logger: {
          error: vi.fn(),
          info: vi.fn(),
        },
      },
    );

    const response = await POST(request as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(prisma.emailAccount.update).toHaveBeenCalledTimes(1);
    expect(prisma.emailToken.delete).toHaveBeenCalledTimes(1);
  });
});
