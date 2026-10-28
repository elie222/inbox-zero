import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

describe("GET /api/user/thread-plans", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.executedRule.findMany.mockResolvedValue([]);
  });

  it("returns aggregated plans for the requested thread", async () => {
    prisma.executedRule.findMany.mockResolvedValue([
      {
        id: "later",
        messageId: "later-message",
        threadId: "thread-1",
        rule: { id: "rule-1", name: "Example rule" },
        actionItems: [
          { id: "label-action", type: "LABEL", label: "Needs response" },
        ],
        status: "APPLIED",
        reason: "Reason for the later message.",
        createdAt: new Date("2026-08-14T12:00:00.000Z"),
      },
      {
        id: "earlier",
        messageId: "earlier-message",
        threadId: "thread-1",
        rule: { id: "rule-1", name: "Example rule" },
        actionItems: [
          { id: "label-action-2", type: "LABEL", label: "Needs response" },
        ],
        status: "APPLIED",
        reason: "Reason for the earlier message.",
        createdAt: new Date("2026-08-14T11:00:00.000Z"),
      },
    ] as never);

    const response = await GET(
      new NextRequest(
        "http://localhost/api/user/thread-plans?threadId=thread-1",
      ),
    );
    const body = await response.json();

    expect(prisma.executedRule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { emailAccountId: "email-account-1", threadId: "thread-1" },
      }),
    );
    expect(body.plans.map((plan: { id: string }) => plan.id)).toEqual([
      "later",
      "earlier",
    ]);
  });

  it("rejects a missing thread id", async () => {
    await expect(
      GET(new NextRequest("http://localhost/api/user/thread-plans")),
    ).rejects.toThrow();
  });
});
