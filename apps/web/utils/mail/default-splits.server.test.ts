import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ActionType,
  MailSplitKind,
  SystemType,
} from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";
import { seedDefaultMailSplits } from "@/utils/mail/default-splits.server";

vi.mock("@/utils/prisma");

describe("seedDefaultMailSplits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("seeds standard rule labels for an account without saved splits", async () => {
    prisma.mailSplit.count.mockResolvedValue(0);

    await seedDefaultMailSplits({
      emailAccountId: "account-id",
      rules: [rule(SystemType.RECEIPT, "receipt-label")],
    });

    expect(prisma.mailSplit.createMany).toHaveBeenCalledWith({
      data: [
        {
          emailAccountId: "account-id",
          name: "Receipt",
          kind: MailSplitKind.LABEL,
          value: "receipt-label",
          order: 0,
        },
      ],
      skipDuplicates: true,
    });
  });

  it("preserves an account's existing split configuration", async () => {
    prisma.mailSplit.count.mockResolvedValue(1);

    await seedDefaultMailSplits({
      emailAccountId: "account-id",
      rules: [rule(SystemType.RECEIPT, "receipt-label")],
    });

    expect(prisma.mailSplit.createMany).not.toHaveBeenCalled();
  });
});

function rule(systemType: SystemType, labelId: string) {
  return {
    systemType,
    actions: [{ type: ActionType.LABEL, labelId }],
  };
}
