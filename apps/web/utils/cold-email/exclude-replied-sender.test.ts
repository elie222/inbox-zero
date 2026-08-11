import { beforeEach, describe, expect, it, vi } from "vitest";
import { GroupItemSource } from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";
import { createTestLogger, getMockMessage } from "@/__tests__/helpers";
import { getColdEmailRule } from "@/utils/cold-email/cold-email-rule";
import { saveLearnedPattern } from "@/utils/rule/learned-patterns";
import { excludeRepliedSendersFromColdEmail } from "./exclude-replied-sender";

vi.mock("@/utils/prisma");
vi.mock("@/utils/cold-email/cold-email-rule", () => ({
  getColdEmailRule: vi.fn(),
}));
vi.mock("@/utils/rule/learned-patterns", () => ({
  saveLearnedPattern: vi.fn(),
}));

describe("excludeRepliedSendersFromColdEmail", () => {
  const logger = createTestLogger();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getColdEmailRule).mockResolvedValue({
      id: "cold-email-rule",
      groupId: "cold-email-group",
    } as any);
    vi.mocked(prisma.executedRule.count).mockResolvedValue(0);
    vi.mocked(prisma.groupItem.findMany).mockResolvedValue([]);
  });

  it("excludes a pinned sender using the casing it was stored under", async () => {
    vi.mocked(prisma.groupItem.findMany).mockResolvedValue([
      { value: "Cold.Sender@Example.com" },
    ] as any);

    await excludeRepliedSendersFromColdEmail({
      emailAccountId: "email-account-1",
      message: getMockMessage({ to: "cold.sender@example.com" }),
      logger,
    });

    expect(saveLearnedPattern).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "email-account-1",
        from: "Cold.Sender@Example.com",
        ruleId: "cold-email-rule",
        exclude: true,
        source: GroupItemSource.USER,
      }),
    );
  });

  it("looks up every recipient of the reply", async () => {
    const base = getMockMessage({ to: "first@example.com" });

    await excludeRepliedSendersFromColdEmail({
      emailAccountId: "email-account-1",
      message: {
        ...base,
        headers: { ...base.headers, cc: "second@example.com" },
      },
      logger,
    });

    expect(prisma.groupItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          groupId: "cold-email-group",
          exclude: false,
          OR: [
            { value: { equals: "first@example.com", mode: "insensitive" } },
            { value: { equals: "second@example.com", mode: "insensitive" } },
          ],
        }),
      }),
    );
  });

  it("never adds a pattern for a sender who was not already pinned", async () => {
    await excludeRepliedSendersFromColdEmail({
      emailAccountId: "email-account-1",
      message: getMockMessage({ to: "stranger@example.com" }),
      logger,
    });

    expect(saveLearnedPattern).not.toHaveBeenCalled();
  });

  it("keeps the pattern when a rule sent on this thread, not the user", async () => {
    vi.mocked(prisma.executedRule.count).mockResolvedValue(1);

    await excludeRepliedSendersFromColdEmail({
      emailAccountId: "email-account-1",
      message: getMockMessage({ to: "cold.sender@example.com" }),
      logger,
    });

    expect(prisma.groupItem.findMany).not.toHaveBeenCalled();
    expect(saveLearnedPattern).not.toHaveBeenCalled();
  });

  it("does nothing when the account has no cold email group", async () => {
    vi.mocked(getColdEmailRule).mockResolvedValue({
      id: "cold-email-rule",
      groupId: null,
    } as any);

    await excludeRepliedSendersFromColdEmail({
      emailAccountId: "email-account-1",
      message: getMockMessage({ to: "someone@example.com" }),
      logger,
    });

    expect(prisma.groupItem.findMany).not.toHaveBeenCalled();
  });

  it("does not query the cold email rule when there are no recipients", async () => {
    await excludeRepliedSendersFromColdEmail({
      emailAccountId: "email-account-1",
      message: getMockMessage({ to: "" }),
      logger,
    });

    expect(getColdEmailRule).not.toHaveBeenCalled();
  });
});
