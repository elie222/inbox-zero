import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createEmailProvider } from "@/utils/email/provider";
import { applySettingsUpdate } from "@/utils/ai/agent/settings";
import { createScopedLogger } from "@/utils/logger";
import { approveAgentAction, denyAgentAction } from "./execution";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: vi.fn(),
}));
vi.mock("@/utils/ai/agent/settings", () => ({
  applySettingsUpdate: vi.fn(),
}));
vi.mock("@/utils/mail", () => ({
  ensureEmailSendingEnabled: vi.fn(),
}));

const logger = createScopedLogger("test");
vi.spyOn(logger, "with").mockReturnValue(logger);

describe("agent execution approvals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(logger, "with").mockReturnValue(logger);
  });

  it("rejects approval when action was already claimed", async () => {
    vi.mocked(prisma.executedAgentAction.findUnique).mockResolvedValue({
      id: "approval-1",
      status: "PENDING_APPROVAL",
      actionData: { type: "updateSettings", settings: {} },
      emailAccountId: "ea-1",
      resourceId: null,
      threadId: null,
      emailAccount: {
        userId: "user-1",
        email: "user@example.com",
        account: { provider: "gmail" },
      },
    } as any);
    vi.mocked(prisma.executedAgentAction.updateMany).mockResolvedValue({
      count: 0,
    } as any);

    const result = await approveAgentAction({
      approvalId: "approval-1",
      userId: "user-1",
      logger,
    });

    expect(result).toEqual({ error: "Action is not pending approval" });
    expect(createEmailProvider).not.toHaveBeenCalled();
    expect(prisma.executedAgentAction.update).not.toHaveBeenCalled();
  });

  it("claims pending approval before executing action", async () => {
    vi.mocked(prisma.executedAgentAction.findUnique).mockResolvedValue({
      id: "approval-1",
      status: "PENDING_APPROVAL",
      actionData: {
        type: "updateSettings",
        settings: { allowedActions: [{ actionType: "archive" }] },
      },
      emailAccountId: "ea-1",
      resourceId: null,
      threadId: null,
      emailAccount: {
        userId: "user-1",
        email: "user@example.com",
        account: { provider: "gmail" },
      },
    } as any);
    vi.mocked(prisma.executedAgentAction.updateMany).mockResolvedValue({
      count: 1,
    } as any);
    vi.mocked(createEmailProvider).mockResolvedValue({} as any);
    vi.mocked(applySettingsUpdate).mockResolvedValue(undefined);
    vi.mocked(prisma.executedAgentAction.update).mockResolvedValue({} as any);

    const result = await approveAgentAction({
      approvalId: "approval-1",
      userId: "user-1",
      logger,
    });

    expect(result).toEqual({ success: true, logId: "approval-1" });
    expect(prisma.executedAgentAction.updateMany).toHaveBeenCalledWith({
      where: { id: "approval-1", status: "PENDING_APPROVAL" },
      data: {
        status: "PENDING",
      },
    });
    expect(applySettingsUpdate).toHaveBeenCalledTimes(1);
  });

  it("rejects deny when action is no longer pending approval", async () => {
    vi.mocked(prisma.executedAgentAction.findUnique).mockResolvedValue({
      id: "approval-1",
      status: "PENDING_APPROVAL",
      emailAccount: { userId: "user-1" },
    } as any);
    vi.mocked(prisma.executedAgentAction.updateMany).mockResolvedValue({
      count: 0,
    } as any);

    const result = await denyAgentAction({
      approvalId: "approval-1",
      userId: "user-1",
    });

    expect(result).toEqual({ error: "Action is not pending approval" });
  });

  it("denies action atomically", async () => {
    vi.mocked(prisma.executedAgentAction.findUnique).mockResolvedValue({
      id: "approval-1",
      status: "PENDING_APPROVAL",
      emailAccount: { userId: "user-1" },
    } as any);
    vi.mocked(prisma.executedAgentAction.updateMany).mockResolvedValue({
      count: 1,
    } as any);

    const result = await denyAgentAction({
      approvalId: "approval-1",
      userId: "user-1",
    });

    expect(result).toEqual({ success: true });
    expect(prisma.executedAgentAction.updateMany).toHaveBeenCalledWith({
      where: { id: "approval-1", status: "PENDING_APPROVAL" },
      data: {
        status: "CANCELLED",
        triggeredBy: "user:user-1:denied",
      },
    });
  });
});
