import { NextRequest } from "next/server";
import { expect, it, vi } from "vitest";
import { SnoozedThreadStatus } from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";
import { GET } from "./route";

vi.mock("@/utils/prisma");
vi.mock("@/utils/middleware", async () => {
  const { createWithEmailAccountTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");
  return {
    ...createWithEmailAccountTestMiddleware(),
    withEmailProvider: vi.fn(),
  };
});

it("lists scheduled snoozes and only preparations that started archiving", async () => {
  prisma.snoozedThread.findMany.mockResolvedValue([]);

  const response = await GET(
    new NextRequest("http://localhost/api/user/snoozed-threads"),
    { params: Promise.resolve({}) },
  );

  expect(response.status).toBe(200);
  expect(prisma.snoozedThread.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        emailAccountId: "email-account-1",
        OR: [
          {
            status: {
              in: [SnoozedThreadStatus.PENDING, SnoozedThreadStatus.EXECUTING],
            },
          },
          { status: SnoozedThreadStatus.PREPARING, archiveStarted: true },
        ],
      },
    }),
  );
});
