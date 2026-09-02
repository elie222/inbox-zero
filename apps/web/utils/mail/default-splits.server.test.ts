import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ActionType,
  MailSplitKind,
  SystemType,
} from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";
import {
  getDefaultMailSplitDraftsForAccount,
  seedDefaultMailSplits,
  setDefaultMailSplits,
} from "@/utils/mail/default-splits.server";

vi.mock("@/utils/prisma");

describe("seedDefaultMailSplits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("seeds standard rule labels for an account without saved splits", async () => {
    prisma.$transaction.mockResolvedValue([[{ locked: true }], 1] as never);

    await seedDefaultMailSplits({
      emailAccountId: "account-id",
      rules: [rule(SystemType.RECEIPT, "receipt-label")],
    });

    expect(prisma.$queryRaw).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.stringContaining("pg_advisory_xact_lock"),
      ]),
      "account-id",
    );
    expect(prisma.$executeRaw).toHaveBeenCalledWith(
      expect.arrayContaining([expect.stringContaining("WHERE NOT EXISTS")]),
      "account-id",
      expect.any(String),
      "account-id",
    );
  });

  it("does not access the database when no rule can produce an inbox split", async () => {
    await seedDefaultMailSplits({
      emailAccountId: "account-id",
      rules: [
        {
          systemType: SystemType.RECEIPT,
          actions: [{ type: ActionType.MOVE_FOLDER, labelId: null }],
        },
      ],
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
        kind: MailSplitKind.LABEL,
        value: "receipt-label",
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

  it("adds missing default splits without replacing saved splits", async () => {
    prisma.$transaction.mockResolvedValue([[{ locked: true }], 1] as never);

    await setDefaultMailSplits({
      emailAccountId: "account-id",
      defaultSplits: [
        {
          name: "Receipt",
          kind: MailSplitKind.LABEL,
          value: "receipt-label",
        },
      ],
      enabled: true,
    });

    expect(prisma.$executeRaw).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.stringContaining('existing."value" = defaults."value"'),
      ]),
      "account-id",
      expect.any(String),
      "account-id",
      expect.any(Number),
      "account-id",
    );
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
          value: "receipt-label",
        },
        {
          name: "Newsletter",
          kind: MailSplitKind.LABEL,
          value: "newsletter-label",
        },
      ],
      enabled: false,
    });

    expect(prisma.mailSplit.deleteMany).toHaveBeenCalledWith({
      where: {
        emailAccountId: "account-id",
        kind: MailSplitKind.LABEL,
        value: { in: ["receipt-label", "newsletter-label"] },
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
