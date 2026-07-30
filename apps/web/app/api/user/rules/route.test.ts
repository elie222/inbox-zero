import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SystemType } from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";

vi.mock("@/utils/prisma");
vi.mock("@/utils/middleware", () => ({
  withEmailAccount:
    (
      _name: string,
      handler: (
        request: NextRequest & Record<string, unknown>,
      ) => Promise<Response>,
    ) =>
    (request: NextRequest) =>
      handler(
        Object.assign(request, {
          auth: { emailAccountId: "email-account-1", userId: "user-1" },
          logger: createScopedLogger("test"),
        }),
      ),
}));

import { GET } from "./route";

describe("GET /api/user/rules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns rules in the canonical order consumed by clients", async () => {
    prisma.rule.findMany.mockResolvedValue([
      {
        id: "custom-disabled",
        name: "Alpha",
        enabled: false,
        systemType: null,
        instructions: null,
      },
      {
        id: "cold-email",
        name: "Cold Email",
        enabled: true,
        systemType: SystemType.COLD_EMAIL,
        instructions: null,
      },
      {
        id: "newsletter",
        name: "Newsletter",
        enabled: true,
        systemType: SystemType.NEWSLETTER,
        instructions: null,
      },
      {
        id: "custom-enabled",
        name: "Bravo",
        enabled: true,
        systemType: null,
        instructions: null,
      },
    ] as never);

    const response = await GET(
      new NextRequest("http://localhost/api/user/rules"),
    );
    const body = await response.json();

    expect(body.map((rule: { id: string }) => rule.id)).toEqual([
      "newsletter",
      "cold-email",
      "custom-enabled",
      "custom-disabled",
    ]);
  });
});
