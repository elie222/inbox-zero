import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActionType, SystemType } from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";
import { seedDefaultMailSplits } from "@/utils/mail/default-splits.server";

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
});

function rule(systemType: SystemType, labelId: string) {
  return {
    systemType,
    actions: [{ type: ActionType.LABEL, labelId }],
  };
}
