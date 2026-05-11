import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

vi.mock("@/utils/prisma");
vi.mock("@/utils/middleware", () => ({
  withEmailAccount:
    (
      _scope: string,
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
    (
      request as NextRequest & {
        auth: { emailAccountId: string };
      }
    ).auth = { emailAccountId: "account-1" };

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
