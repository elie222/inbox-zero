import { beforeEach, describe, expect, it, vi } from "vitest";
import { GroupItemType } from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";
import {
  assertNoSenderOnlyOverlap,
  findSenderOnlyOverlapConflict,
} from "./sender-scope-overlap";

vi.mock("@/utils/prisma");

const emailAccountId = "email-account-1";

describe("findSenderOnlyOverlapConflict", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips rules that are not sender-only", async () => {
    const result = await findSenderOnlyOverlapConflict({
      emailAccountId,
      rule: {
        from: "@example.com",
        instructions: "Only handle urgent messages.",
      },
    });

    expect(result).toBeNull();
    expect(prisma.rule.findMany).not.toHaveBeenCalled();
  });

  it("finds overlap between proposed senders and existing sender domains", async () => {
    prisma.rule.findMany.mockResolvedValue([
      senderRule({
        name: "Existing sender rule",
        from: "@example.com",
      }),
    ] as any);

    const result = await findSenderOnlyOverlapConflict({
      emailAccountId,
      rule: {
        from: "Person@Example.com, other@different.example",
      },
      excludeRuleId: "current-rule-id",
    });

    expect(prisma.rule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          emailAccountId,
          enabled: true,
          id: { not: "current-rule-id" },
        }),
      }),
    );
    expect(result).toEqual({
      ruleName: "Existing sender rule",
      overlappingSenders: ["person@example.com"],
    });
  });

  it("ignores existing rules that have additional conditions", async () => {
    prisma.rule.findMany.mockResolvedValue([
      senderRule({
        name: "Narrow existing rule",
        from: "@example.com",
        subject: "Receipt",
      }),
    ] as any);

    const result = await findSenderOnlyOverlapConflict({
      emailAccountId,
      rule: { from: "person@example.com" },
    });

    expect(result).toBeNull();
  });

  it("respects excluded sender patterns on the existing rule", async () => {
    prisma.rule.findMany.mockResolvedValue([
      senderRule({
        name: "Existing sender rule",
        from: "@example.com",
        groupItems: [{ value: "person@example.com", exclude: true }],
      }),
    ] as any);

    const result = await findSenderOnlyOverlapConflict({
      emailAccountId,
      rule: { from: "person@example.com" },
    });

    expect(result).toBeNull();
  });

  it("uses included sender patterns as overlap exceptions", async () => {
    prisma.rule.findMany.mockResolvedValue([
      senderRule({
        name: "Existing sender rule",
        from: "@different.example",
        groupItems: [{ value: "person@example.com", exclude: false }],
      }),
    ] as any);

    const result = await findSenderOnlyOverlapConflict({
      emailAccountId,
      rule: { from: "person@example.com" },
    });

    expect(result).toEqual({
      ruleName: "Existing sender rule",
      overlappingSenders: ["person@example.com"],
    });
  });
});

describe("assertNoSenderOnlyOverlap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws a safe error when sender-only scopes overlap", async () => {
    prisma.rule.findMany.mockResolvedValue([
      senderRule({
        name: "Existing sender rule",
        from: "@example.com",
      }),
    ] as any);

    await expect(
      assertNoSenderOnlyOverlap({
        emailAccountId,
        rule: { from: "person@example.com" },
      }),
    ).rejects.toThrow(
      'Cannot create this rule because it overlaps the existing "Existing sender rule" rule on sender scope person@example.com.',
    );
  });
});

function senderRule({
  name,
  from,
  instructions = null,
  to = null,
  subject = null,
  body = null,
  groupId = null,
  groupItems = [],
}: {
  name: string;
  from: string;
  instructions?: string | null;
  to?: string | null;
  subject?: string | null;
  body?: string | null;
  groupId?: string | null;
  groupItems?: Array<{ value: string; exclude: boolean }>;
}) {
  return {
    name,
    instructions,
    from,
    to,
    subject,
    body,
    groupId,
    group: {
      items: groupItems.map((item) => ({
        ...item,
        type: GroupItemType.FROM,
      })),
    },
  };
}
