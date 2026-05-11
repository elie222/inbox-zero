import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

vi.mock("@/utils/prisma");
vi.mock("@/utils/middleware", () => ({
  withEmailAccount:
    (
      handler: (request: NextRequest, ...args: unknown[]) => Promise<Response>,
    ) =>
    (request: NextRequest, ...args: unknown[]) =>
      handler(
        request as NextRequest & {
          auth: { emailAccountId: string };
        },
        ...args,
      ),
}));

import { GET } from "./route";

describe("GET /api/user/drive/filings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not include transient processing filings in recent activity", async () => {
    prisma.documentFiling.findMany.mockResolvedValue([]);
    prisma.documentFiling.count.mockResolvedValue(0);

    const request = new NextRequest(
      "http://localhost:3000/api/user/drive/filings",
    );
    (
      request as NextRequest & {
        auth: { emailAccountId: string };
      }
    ).auth = { emailAccountId: "email-account-1" };

    const response = await GET(request, {} as never);
    const body = await response.json();

    expect(prisma.documentFiling.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          emailAccountId: "email-account-1",
          status: { not: "PROCESSING" },
        },
      }),
    );
    expect(prisma.documentFiling.count).toHaveBeenCalledWith({
      where: {
        emailAccountId: "email-account-1",
        status: { not: "PROCESSING" },
      },
    });
    expect(body).toEqual({
      filings: [],
      total: 0,
      hasMore: false,
    });
  });
});
