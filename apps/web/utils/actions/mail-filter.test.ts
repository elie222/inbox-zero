import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

const { createRuleMock, saveLearnedPatternMock } = vi.hoisted(() => ({
  createRuleMock: vi.fn(),
  saveLearnedPatternMock: vi.fn(),
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
vi.mock("@/utils/rule/learned-patterns", () => ({
  saveLearnedPattern: saveLearnedPatternMock,
}));

import { createMailFilterAction } from "@/utils/actions/mail-filter";

beforeEach(() => {
  vi.clearAllMocks();

  prisma.emailAccount.findUnique.mockResolvedValue({
    email: "user@example.com",
    account: { userId: "user-1", provider: "google" },
  } as any);
  prisma.rule.findFirst.mockResolvedValue(null);
  prisma.groupItem.findMany.mockResolvedValue([]);
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
        runOnThreads: true,
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
        runOnThreads: true,
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
        runOnThreads: true,
        conditionalOperator: "OR",
      },
    });
  });

  it("retrains learned patterns: deletes conflicts on other rules and pins senders", async () => {
    prisma.groupItem.findMany.mockResolvedValue([
      { id: "item-1", value: "feedback@drivecentric.com" },
      { id: "item-2", value: "unrelated@elsewhere.com" },
    ] as any);
    prisma.groupItem.deleteMany.mockResolvedValue({ count: 1 } as any);

    await createMailFilterAction("account-1", {
      matchType: "domain",
      value: "drivecentric.com",
      labelName: "Notifications",
    });

    expect(prisma.groupItem.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["item-1"] } },
    });
    expect(saveLearnedPatternMock).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "account-1",
        from: "@drivecentric.com",
        ruleId: "rule-1",
        source: "USER",
      }),
    );
  });

  it("skips learned-pattern retraining for subject filters", async () => {
    await createMailFilterAction("account-1", {
      matchType: "subject",
      value: "Weekly digest",
      labelName: "Notifications",
    });

    expect(prisma.groupItem.findMany).not.toHaveBeenCalled();
    expect(saveLearnedPatternMock).not.toHaveBeenCalled();
  });
});
