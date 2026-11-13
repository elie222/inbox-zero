import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GroupItemSource,
  GroupItemType,
  SystemType,
} from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";
import {
  cleanupLegacyLabelRemovalExclusions,
  LEGACY_LABEL_REMOVAL_CUTOFF,
  wouldLearnExclusionToday,
} from "@/utils/rule/legacy-label-removal-exclusions";

vi.mock("@/utils/prisma", () => ({
  default: {
    groupItem: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    classificationFeedback: {
      findMany: vi.fn(),
    },
    executedRule: {
      findMany: vi.fn(),
    },
  },
}));

const T0 = new Date("2026-09-01T12:00:00Z");

describe("wouldLearnExclusionToday", () => {
  it("is false for a single removal", () => {
    expect(
      wouldLearnExclusionToday({
        sender: "a@example.com",
        ruleRemovals: [removal("a@example.com", "m1", 0)],
      }),
    ).toBe(false);
  });

  it("is false for repeated removals within 15 minutes", () => {
    expect(
      wouldLearnExclusionToday({
        sender: "a@example.com",
        ruleRemovals: [
          removal("a@example.com", "m1", 0),
          removal("a@example.com", "m2", 10),
        ],
      }),
    ).toBe(false);
  });

  it("is false when the same message was removed twice", () => {
    expect(
      wouldLearnExclusionToday({
        sender: "a@example.com",
        ruleRemovals: [
          removal("a@example.com", "m1", 0),
          removal("a@example.com", "m1", 60),
        ],
      }),
    ).toBe(false);
  });

  it("is true for removals of different messages more than 15 minutes apart", () => {
    expect(
      wouldLearnExclusionToday({
        sender: "A@Example.com",
        ruleRemovals: [
          removal("a@example.com", "m1", 0),
          removal("other@example.com", "m9", 30),
          removal("a@example.com", "m2", 60),
        ],
      }),
    ).toBe(true);
  });

  it("is false when a removal was credited to a rule that never labelled the message", () => {
    expect(
      wouldLearnExclusionToday({
        sender: "a@example.com",
        ruleRemovals: [
          removal("a@example.com", "m1", 0, false),
          removal("a@example.com", "m2", 60),
        ],
      }),
    ).toBe(false);
  });

  it("is false when the later removal was part of a sweep", () => {
    const sweep = Array.from({ length: 9 }, (_, i) =>
      removal(`s${i}@example.com`, `sweep-${i}`, 55),
    );

    expect(
      wouldLearnExclusionToday({
        sender: "a@example.com",
        ruleRemovals: [
          removal("a@example.com", "m1", 0),
          ...sweep,
          removal("a@example.com", "m2", 60),
        ],
      }),
    ).toBe(false);
  });
});

describe("cleanupLegacyLabelRemovalExclusions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.groupItem.deleteMany).mockResolvedValue({ count: 0 });
  });

  it("only considers old exclusions learned from label removals", async () => {
    vi.mocked(prisma.groupItem.findMany).mockResolvedValue([]);

    await cleanupLegacyLabelRemovalExclusions({ apply: false });

    expect(prisma.groupItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          source: GroupItemSource.LABEL_REMOVED,
          exclude: true,
          type: GroupItemType.FROM,
          createdAt: { lt: LEGACY_LABEL_REMOVAL_CUTOFF },
          updatedAt: { lt: LEGACY_LABEL_REMOVAL_CUTOFF },
        }),
      }),
    );
  });

  it("reports unsupported exclusions without deleting in dry-run mode", async () => {
    mockCandidates();

    const stats = await cleanupLegacyLabelRemovalExclusions({ apply: false });

    expect(stats).toEqual({
      scanned: 4,
      kept: 1,
      skippedWithoutRule: 1,
      removable: 2,
      removed: 0,
      emailAccounts: 1,
      rules: 2,
    });
    expect(prisma.groupItem.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes only unsupported exclusions, rechecking the candidate filter", async () => {
    mockCandidates();
    vi.mocked(prisma.groupItem.deleteMany).mockResolvedValue({ count: 2 });

    const stats = await cleanupLegacyLabelRemovalExclusions({ apply: true });

    expect(prisma.groupItem.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.groupItem.deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: { in: ["item-single", "item-custom"] },
        source: GroupItemSource.LABEL_REMOVED,
        exclude: true,
      }),
    });
    expect(stats.removed).toBe(2);
  });
});

function removal(
  sender: string,
  messageId: string,
  minutes: number,
  attributed = true,
) {
  return {
    sender,
    messageId,
    createdAt: new Date(T0.getTime() + minutes * 60_000),
    attributed,
  };
}

function mockCandidates() {
  const newsletterRule = { id: "rule-news", systemType: SystemType.NEWSLETTER };
  const customRule = { id: "rule-custom", systemType: null };

  vi.mocked(prisma.groupItem.findMany)
    .mockResolvedValueOnce([
      {
        id: "item-repeated",
        value: "repeat@example.com",
        group: { emailAccountId: "acc-1", rule: newsletterRule },
      },
      {
        id: "item-single",
        value: "once@example.com",
        group: { emailAccountId: "acc-1", rule: newsletterRule },
      },
      {
        id: "item-custom",
        value: "repeat@example.com",
        group: { emailAccountId: "acc-1", rule: customRule },
      },
      {
        id: "item-orphan",
        value: "orphan@example.com",
        group: { emailAccountId: "acc-1", rule: null },
      },
    ] as any)
    .mockResolvedValueOnce([]);

  vi.mocked(prisma.classificationFeedback.findMany).mockResolvedValue(
    [
      ["rule-news", "repeat@example.com", "m1", 0],
      ["rule-news", "repeat@example.com", "m2", 60],
      ["rule-news", "once@example.com", "m3", 0],
      ["rule-custom", "repeat@example.com", "m4", 0],
      ["rule-custom", "repeat@example.com", "m5", 60],
    ].map(([ruleId, sender, messageId, minutes]) => {
      const { attributed: _, ...row } = removal(
        sender as string,
        messageId as string,
        minutes as number,
      );
      return { ruleId, ...row };
    }) as any,
  );
  vi.mocked(prisma.executedRule.findMany).mockResolvedValue(
    ["m1", "m2", "m3"].map((messageId) => ({
      ruleId: "rule-news",
      messageId,
    })) as any,
  );
}
