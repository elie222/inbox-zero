import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

const { createRuleMock } = vi.hoisted(() => ({
  createRuleMock: vi.fn(),
}));

vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "user@example.com" },
  })),
}));
vi.mock("@/utils/rule/rule", () => ({
  createRule: createRuleMock,
}));

import { createMailFilterAction } from "@/utils/actions/mail-filter";

beforeEach(() => {
  vi.clearAllMocks();

  prisma.emailAccount.findUnique.mockResolvedValue({
    email: "user@example.com",
    account: { userId: "user-1", provider: "google" },
  } as any);
  prisma.rule.findFirst.mockResolvedValue(null);
  createRuleMock.mockResolvedValue({
    id: "rule-1",
    name: "Filter: Notifications",
    actions: [{ type: "LABEL", labelId: "label-1" }],
  });
});

describe("createMailFilterAction", () => {
  it("creates a rule with normalized senders and optional AI instructions", async () => {
    const result = await createMailFilterAction("account-1", {
      matchType: "sender",
      value: "Joe@DrivePremier.com, alerts@Shop.com , joe@drivepremier.com",
      labelName: "Notifications",
      instructions: "Order updates belong here",
    });

    expect(result?.data).toMatchObject({
      ruleId: "rule-1",
      merged: false,
      labelId: "label-1",
    });
    expect(createRuleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        result: expect.objectContaining({
          condition: {
            conditionalOperator: "OR",
            aiInstructions: "Order updates belong here",
            static: {
              from: "joe@drivepremier.com, alerts@shop.com",
              to: null,
              subject: null,
            },
          },
        }),
      }),
    );
  });

  it("normalizes domain lists to @-prefixed lowercase", async () => {
    await createMailFilterAction("account-1", {
      matchType: "domain",
      value: "X.com, @Y.com",
      labelName: "Notifications",
    });

    expect(createRuleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        result: expect.objectContaining({
          condition: expect.objectContaining({
            static: expect.objectContaining({ from: "@x.com, @y.com" }),
          }),
        }),
      }),
    );
  });

  it("merges into an existing rule for the folder instead of overlapping", async () => {
    prisma.rule.findFirst.mockResolvedValue({
      id: "rule-9",
      name: "Notifications",
      from: "old@x.com",
      instructions: "Existing guidance",
      actions: [{ type: "LABEL", labelId: "label-9" }],
    } as any);
    prisma.rule.update.mockResolvedValue({} as any);

    const result = await createMailFilterAction("account-1", {
      matchType: "sender",
      value: "new@y.com, OLD@x.com",
      labelName: "Notifications",
      instructions: "Also shipping updates",
    });

    expect(result?.data).toMatchObject({
      ruleId: "rule-9",
      merged: true,
      labelId: "label-9",
    });
    expect(createRuleMock).not.toHaveBeenCalled();
    expect(prisma.rule.update).toHaveBeenCalledWith({
      where: { id: "rule-9" },
      data: {
        from: "old@x.com, new@y.com",
        instructions: "Existing guidance\nAlso shipping updates",
        conditionalOperator: "OR",
      },
    });
  });

  it("keeps existing instructions untouched when no new why is given", async () => {
    prisma.rule.findFirst.mockResolvedValue({
      id: "rule-9",
      name: "Notifications",
      from: null,
      instructions: "Existing guidance",
      actions: [{ type: "LABEL", labelId: "label-9" }],
    } as any);
    prisma.rule.update.mockResolvedValue({} as any);

    await createMailFilterAction("account-1", {
      matchType: "sender",
      value: "new@y.com",
      labelName: "Notifications",
    });

    expect(prisma.rule.update).toHaveBeenCalledWith({
      where: { id: "rule-9" },
      data: {
        from: "new@y.com",
        instructions: "Existing guidance",
        conditionalOperator: "OR",
      },
    });
  });
});
