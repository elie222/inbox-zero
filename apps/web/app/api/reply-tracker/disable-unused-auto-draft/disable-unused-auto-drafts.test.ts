import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { disableUnusedAutoDrafts } from "./disable-unused-auto-drafts";
import { ActionType } from "@prisma/client";

vi.mock("@/utils/prisma");
vi.mock("server-only", () => ({}));

describe("disableUnusedAutoDrafts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should disable auto-draft for a user who has not sent any recent drafts", async () => {
    const autoDraftActions = [
      {
        id: "action-1",
        rule: { id: "rule-1", emailAccountId: "user-1" },
      },
    ];
    (prisma.action.findMany as any).mockResolvedValueOnce(autoDraftActions);
    (prisma.executedAction.findMany as any).mockResolvedValueOnce([
      { id: "exec-1", wasDraftSent: false },
      { id: "exec-2", wasDraftSent: false },
    ]);

    const result = await disableUnusedAutoDrafts();

    expect(prisma.action.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["action-1"] },
        type: ActionType.DRAFT_EMAIL,
        content: null,
      },
    });
    expect(result).toEqual({ usersChecked: 1, usersDisabled: 1, errors: 0 });
  });

  it("should not disable auto-draft for a user who has sent a recent draft", async () => {
    const autoDraftActions = [
      {
        id: "action-1",
        rule: { id: "rule-1", emailAccountId: "user-1" },
      },
    ];
    (prisma.action.findMany as any).mockResolvedValueOnce(autoDraftActions);
    (prisma.executedAction.findMany as any).mockResolvedValueOnce([
      { id: "exec-1", wasDraftSent: false },
      { id: "exec-2", wasDraftSent: true },
    ]);

    const result = await disableUnusedAutoDrafts();

    expect(prisma.action.deleteMany).not.toHaveBeenCalled();
    expect(result).toEqual({ usersChecked: 1, usersDisabled: 0, errors: 0 });
  });

  it("should disable auto-draft for a user with no executed draft actions", async () => {
    const autoDraftActions = [
      {
        id: "action-1",
        rule: { id: "rule-1", emailAccountId: "user-1" },
      },
    ];
    (prisma.action.findMany as any).mockResolvedValueOnce(autoDraftActions);
    (prisma.executedAction.findMany as any).mockResolvedValueOnce([]);

    const result = await disableUnusedAutoDrafts();

    expect(prisma.action.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["action-1"] },
        type: ActionType.DRAFT_EMAIL,
        content: null,
      },
    });
    expect(result).toEqual({ usersChecked: 1, usersDisabled: 1, errors: 0 });
  });

  it("should do nothing if no users have auto-draft enabled", async () => {
    (prisma.action.findMany as any).mockResolvedValueOnce([]);

    const result = await disableUnusedAutoDrafts();

    expect(prisma.executedAction.findMany).not.toHaveBeenCalled();
    expect(prisma.action.deleteMany).not.toHaveBeenCalled();
    expect(result).toEqual({ usersChecked: 0, usersDisabled: 0, errors: 0 });
  });

  it("should correctly handle multiple users, disabling one and not the other", async () => {
    const autoDraftActions = [
      {
        id: "action-user-1",
        rule: { id: "rule-user-1", emailAccountId: "user-1" },
      },
      {
        id: "action-user-2",
        rule: { id: "rule-user-2", emailAccountId: "user-2" },
      },
    ];
    (prisma.action.findMany as any).mockResolvedValueOnce(autoDraftActions);

    (prisma.executedAction.findMany as any).mockImplementation(
      async (args: any) => {
        const ruleIds = args.where?.executedRule?.ruleId?.in;
        if (ruleIds.includes("rule-user-1")) {
          return [{ id: "exec-u1", wasDraftSent: true }]; // User 1 sent a draft
        }
        if (ruleIds.includes("rule-user-2")) {
          return [{ id: "exec-u2", wasDraftSent: false }]; // User 2 did not
        }
        return [];
      },
    );

    const result = await disableUnusedAutoDrafts();

    expect(prisma.action.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.action.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["action-user-2"] },
        type: ActionType.DRAFT_EMAIL,
        content: null,
      },
    });
    expect(result).toEqual({ usersChecked: 2, usersDisabled: 1, errors: 0 });
  });

  it("should handle a user with multiple auto-draft rules and disable if no drafts sent", async () => {
    const autoDraftActions = [
      { id: "action-1", rule: { id: "rule-1", emailAccountId: "user-1" } },
      { id: "action-2", rule: { id: "rule-2", emailAccountId: "user-1" } },
    ];
    (prisma.action.findMany as any).mockResolvedValueOnce(autoDraftActions);
    (prisma.executedAction.findMany as any).mockResolvedValueOnce([
      { id: "exec-1", wasDraftSent: false },
    ]);

    const result = await disableUnusedAutoDrafts();

    expect(prisma.executedAction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          executedRule: { ruleId: { in: ["rule-1", "rule-2"] } },
        }),
      }),
    );
    expect(prisma.action.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["action-1", "action-2"] },
        type: ActionType.DRAFT_EMAIL,
        content: null,
      },
    });
    expect(result).toEqual({ usersChecked: 1, usersDisabled: 1, errors: 0 });
  });
});
