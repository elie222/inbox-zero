import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ActionType,
  MailSplitFilterKind,
  SystemType,
} from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";
import {
  getDefaultMailSplitDraftsForAccount,
  setDefaultMailSplits,
} from "@/utils/mail/default-splits.server";

vi.mock("@/utils/prisma");

describe("setDefaultMailSplits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("seeds standard rule labels for an account without saved splits", async () => {
    prisma.$transaction.mockResolvedValue([[{ locked: true }], 1] as never);

    await setDefaultMailSplits({
      emailAccountId: "account-id",
      defaultSplits: [
        {
          name: "Receipt",
          labelId: "receipt-label",
          filters: [
            { kind: MailSplitFilterKind.LABEL, value: "receipt-label" },
          ],
        },
      ],
      enabled: true,
    });

    expect(prisma.$queryRaw).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.stringContaining("pg_advisory_xact_lock"),
      ]),
      "account-id",
    );
  });

  it("does not access the database when no rule can produce an inbox split", async () => {
    await setDefaultMailSplits({
      emailAccountId: "account-id",
      defaultSplits: [],
      enabled: true,
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
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
        labelId: "receipt-label",
        filters: [{ kind: MailSplitFilterKind.LABEL, value: "receipt-label" }],
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
});

function rule(systemType: SystemType, labelId: string) {
  return {
    systemType,
    actions: [{ type: ActionType.LABEL, labelId }],
  };
}
