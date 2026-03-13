import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

vi.mock("@/utils/prisma");
vi.mock("@/utils/risk", () => ({
  getActionRiskLevel: vi.fn(),
}));
vi.mock("@/app/(app)/[emailAccountId]/assistant/examples", () => ({
  hasExampleParams: vi.fn(() => false),
}));
vi.mock("@/utils/rule/rule-history", () => ({
  createRuleHistory: vi.fn(),
}));
vi.mock("@/utils/email/provider-types", () => ({
  isMicrosoftProvider: vi.fn(() => false),
}));
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: vi.fn(),
}));
vi.mock("@/utils/label/resolve-label", () => ({
  resolveLabelNameAndId: vi.fn(),
}));
vi.mock("@/utils/rule/recipient-validation", () => ({
  getMissingRecipientMessage: vi.fn(),
}));
vi.mock("@/utils/prisma-helpers", () => ({
  isDuplicateError: vi.fn(() => false),
}));

import { deleteRule } from "./rule";

describe("deleteRule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes the group first and relies on cascade delete for grouped rules", async () => {
    prisma.group.deleteMany.mockResolvedValue({ count: 1 });

    await deleteRule({
      emailAccountId: "email-account-id",
      ruleId: "rule-id",
      groupId: "group-id",
    });

    expect(prisma.group.deleteMany).toHaveBeenCalledWith({
      where: { id: "group-id", emailAccountId: "email-account-id" },
    });
    expect(prisma.rule.delete).not.toHaveBeenCalled();
  });

  it("falls back to deleting the rule when the group is already gone", async () => {
    prisma.group.deleteMany.mockResolvedValue({ count: 0 });
    prisma.rule.delete.mockResolvedValue({ id: "rule-id" });

    await deleteRule({
      emailAccountId: "email-account-id",
      ruleId: "rule-id",
      groupId: "group-id",
    });

    expect(prisma.group.deleteMany).toHaveBeenCalledWith({
      where: { id: "group-id", emailAccountId: "email-account-id" },
    });
    expect(prisma.rule.delete).toHaveBeenCalledWith({
      where: { id: "rule-id", emailAccountId: "email-account-id" },
    });
  });

  it("deletes the rule directly when there is no group", async () => {
    prisma.rule.delete.mockResolvedValue({ id: "rule-id" });

    await deleteRule({
      emailAccountId: "email-account-id",
      ruleId: "rule-id",
      groupId: null,
    });

    expect(prisma.group.deleteMany).not.toHaveBeenCalled();
    expect(prisma.rule.delete).toHaveBeenCalledWith({
      where: { id: "rule-id", emailAccountId: "email-account-id" },
    });
  });
});
