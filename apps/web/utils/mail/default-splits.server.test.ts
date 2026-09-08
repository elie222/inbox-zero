import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ActionType,
  MailSplitKind,
  SystemType,
} from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";
import {
  getDefaultMailSplitDraftsForAccount,
  setDefaultMailSplits,
} from "@/utils/mail/default-splits.server";

vi.mock("@/utils/prisma");

describe("default mail splits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads the enabled standard rules that can provide default splits", async () => {
    prisma.rule.findMany.mockResolvedValue([
      rule(SystemType.RECEIPT, "receipt-label"),
    ] as never);

    await expect(
      getDefaultMailSplitDraftsForAccount("account-id"),
    ).resolves.toEqual([
      {
        name: "Receipt",
        kind: MailSplitKind.LABEL,
        values: ["receipt-label"],
      },
    ]);
    expect(prisma.rule.findMany).toHaveBeenCalledWith({
      where: {
        emailAccountId: "account-id",
        enabled: true,
        systemType: { in: expect.arrayContaining([SystemType.RECEIPT]) },
      },
      select: {
        systemType: true,
        actions: { select: { type: true, labelId: true } },
      },
    });
  });

  it("removes every split backed by a default rule label", async () => {
    prisma.$transaction.mockResolvedValue([
      [{ locked: true }],
      { count: 2 },
    ] as never);

    await setDefaultMailSplits({
      emailAccountId: "account-id",
      defaultSplits: [
        {
          name: "Receipt",
          kind: MailSplitKind.LABEL,
          values: ["receipt-label"],
        },
        {
          name: "Newsletter",
          kind: MailSplitKind.LABEL,
          values: ["newsletter-label"],
        },
      ],
      enabled: false,
    });

    expect(prisma.mailSplit.deleteMany).toHaveBeenCalledWith({
      where: {
        emailAccountId: "account-id",
        kind: MailSplitKind.LABEL,
        OR: [
          { values: { equals: ["receipt-label"] } },
          { values: { equals: ["newsletter-label"] } },
        ],
      },
    });
  });

  it("does not partially add defaults when the account has too few slots", async () => {
    prisma.$transaction.mockResolvedValue([
      [{ locked: true }],
      [{ availableCount: 1, missingCount: 2 }],
    ] as never);

    await expect(
      setDefaultMailSplits({
        emailAccountId: "account-id",
        defaultSplits: [
          {
            name: "Receipt",
            kind: MailSplitKind.LABEL,
            values: ["receipt-label"],
          },
          {
            name: "Newsletter",
            kind: MailSplitKind.LABEL,
            values: ["newsletter-label"],
          },
        ],
        enabled: true,
      }),
    ).resolves.toEqual({ status: "limit" });
  });
});

function rule(systemType: SystemType, labelId: string) {
  return {
    systemType,
    actions: [{ type: ActionType.LABEL, labelId }],
  };
}
