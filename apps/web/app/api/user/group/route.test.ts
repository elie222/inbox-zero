import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

vi.mock("@/utils/prisma");
vi.mock("@/utils/middleware", async () => {
  const { createWithEmailAccountTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithEmailAccountTestMiddleware({
    auth: {
      userId: "user-1",
      emailAccountId: "account-1",
      email: "user@example.com",
    },
  });
});

import { GET } from "./route";

describe("user/group route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists only learned pattern groups that still belong to a rule", async () => {
    prisma.group.findMany.mockResolvedValue([
      {
        id: "group-1",
        name: "Notification",
        rule: {
          id: "rule-1",
          name: "Notification",
        },
        _count: {
          items: 3,
        },
      },
    ] as Awaited<ReturnType<typeof prisma.group.findMany>>);

    const request = new NextRequest("http://localhost:3000/api/user/group");

    const response = await GET(request, {} as never);
    const body = await response.json();

    expect(prisma.group.findMany).toHaveBeenCalledWith({
      where: {
        emailAccountId: "account-1",
        rule: { isNot: null },
      },
      select: {
        id: true,
        name: true,
        rule: { select: { id: true, name: true } },
        _count: { select: { items: true } },
      },
    });
    expect(body).toEqual({
      groups: [
        {
          id: "group-1",
          name: "Notification",
          rule: {
            id: "rule-1",
            name: "Notification",
          },
          _count: {
            items: 3,
          },
        },
      ],
    });
  });
});
