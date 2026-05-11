import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

vi.mock("@/utils/prisma");
vi.mock("@/utils/middleware", async () => {
  const { createWithEmailAccountTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithEmailAccountTestMiddleware();
});

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
