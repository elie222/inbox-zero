import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";
import { GET } from "./route";

vi.mock("@/env", () => ({ env: { INTERNAL_API_KEY: "fixture-listener-key" } }));
vi.mock("@/utils/prisma");
vi.mock("@/utils/middleware", () => ({
  withError:
    (_name: string, handler: (request: NextRequest) => Promise<Response>) =>
    (request: NextRequest) =>
      handler(Object.assign(request, { logger: createScopedLogger("test") })),
}));

describe("Fastmail listener configuration", () => {
  beforeEach(() => vi.resetAllMocks());

  it("does not read credentials for an unauthenticated caller", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/fastmail/accounts"),
    );
    expect(response.status).toBe(401);
    expect(prisma.emailAccount.findMany).not.toHaveBeenCalled();
  });

  it("returns only listener credentials and prevents caching", async () => {
    prisma.emailAccount.findMany.mockResolvedValue([
      { id: "fixture-account", account: { access_token: "fixture-token" } },
    ] as never);
    const response = await GET(
      new NextRequest("http://localhost/api/fastmail/accounts", {
        headers: { "x-api-key": "fixture-listener-key" },
      }),
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      accounts: [
        { emailAccountId: "fixture-account", accessToken: "fixture-token" },
      ],
    });
  });
});
