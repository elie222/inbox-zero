import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createTestLogger, getAction, getRule } from "@/__tests__/helpers";
import prisma from "@/utils/__mocks__/prisma";
import { ActionType } from "@/generated/prisma/enums";
import { POST } from "@/app/api/v1/rules/route";
import { PUT } from "@/app/api/v1/rules/[id]/route";

vi.mock("@/utils/prisma");
vi.mock("@/utils/api-middleware", () => ({
  withAccountApiKey: (_name: string, _scopes: string[], handler: unknown) =>
    handler,
}));
vi.mock("@/utils/premium/server", () => ({
  assertCanUseDigestsIfNeeded: vi.fn(),
}));
vi.mock("@/utils/rule/rule-history", () => ({
  createRuleHistory: vi.fn(),
}));
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: vi.fn(),
}));
vi.mock("@/utils/integration-action.server", () => ({
  isIntegrationActionEnabledForEmailAccountId: vi.fn(),
}));

const logger = createTestLogger();
const accountId = "email-account-id";

describe("public rule replacement enablement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let stored = { ...getRule(""), id: "rule-id", group: null };
    prisma.rule.findMany.mockResolvedValue([]);
    prisma.rule.findUnique.mockImplementation(async () => stored);
    prisma.rule.findFirst.mockImplementation(async () => stored);
    prisma.rule.create.mockImplementation(async ({ data }) => {
      stored = {
        ...stored,
        ...data,
        actions: (data.actions?.createMany?.data as any[]).map((action) =>
          getAction(action),
        ),
      } as typeof stored;
      return stored;
    });
    prisma.rule.update.mockImplementation(async ({ data }) => {
      stored = {
        ...stored,
        ...Object.fromEntries(
          Object.entries(data).filter(
            ([key, value]) => key !== "actions" && value !== undefined,
          ),
        ),
        actions: (data.actions?.createMany?.data as any[]).map((action) =>
          getAction(action),
        ),
      };
      return stored;
    });
  });

  it("keeps forwarding disabled whether created directly or introduced by PUT", async () => {
    const forward = {
      name: "Forward matching mail",
      condition: { static: { subject: "Synthetic test subject" } },
      actions: [
        { type: ActionType.FORWARD, fields: { to: "archive@example.com" } },
      ],
    };
    const context = { params: Promise.resolve({ id: "rule-id" }) };

    const direct = await POST(request("POST", forward), context);
    expect(direct.status).toBe(201);
    expect((await direct.json()).rule.enabled).toBe(false);

    const safe = await POST(
      request("POST", {
        ...forward,
        actions: [{ type: ActionType.MARK_READ }],
      }),
      context,
    );
    expect(safe.status).toBe(201);
    expect((await safe.json()).rule.enabled).toBe(true);

    const replacement = await PUT(request("PUT", forward), context);
    expect(replacement.status).toBe(200);
    expect((await replacement.json()).rule).toMatchObject({
      enabled: false,
      actions: [
        { type: ActionType.FORWARD, fields: { to: "archive@example.com" } },
      ],
    });
  });
});

function request(method: string, body: unknown) {
  return Object.assign(
    new NextRequest("https://example.com/api/v1/rules/rule-id", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    {
      apiAuth: {
        emailAccountId: accountId,
        provider: "google",
        userId: "user-id",
      },
      logger,
    },
  ) as Parameters<typeof PUT>[0];
}
