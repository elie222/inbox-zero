import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createEmailProvider } from "@/utils/email/provider";
import { validateAction } from "@/utils/ai/agent/validation/allowed-actions";
import { createScopedLogger } from "@/utils/logger";
import { bulkArchiveTool } from "./bulk";

vi.mock("server-only", () => ({}));
vi.mock("ai", () => ({
  tool: (definition: any) => definition,
}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: vi.fn(),
}));
vi.mock("@/utils/ai/agent/validation/allowed-actions", () => ({
  validateAction: vi.fn(),
}));

const logger = createScopedLogger("test");
vi.spyOn(logger, "with").mockReturnValue(logger);

describe("bulkArchiveTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(logger, "with").mockReturnValue(logger);
  });

  it("blocks when archive action is not allowed", async () => {
    vi.mocked(validateAction).mockResolvedValue({
      allowed: false,
      reason: 'Action type "archive" not enabled',
      conditionsChecked: [],
    });
    vi.mocked(prisma.executedAgentAction.create).mockResolvedValue({
      id: "log-blocked",
    } as any);

    const tool = bulkArchiveTool({
      emailAccountId: "ea-1",
      emailAccountEmail: "user@example.com",
      provider: "gmail",
      resourceType: "email",
      logger,
    } as any);
    const result = await tool.execute({ senders: ["news@example.com"] });

    expect(result).toEqual({
      archived: 0,
      senders: 1,
      blocked: true,
      reason: 'Action type "archive" not enabled',
      logId: "log-blocked",
    });
    expect(createEmailProvider).not.toHaveBeenCalled();
  });

  it("logs and executes bulk archive when allowed", async () => {
    vi.mocked(validateAction).mockResolvedValue({
      allowed: true,
      conditionsChecked: [],
    } as any);
    vi.mocked(prisma.executedAgentAction.create).mockResolvedValue({
      id: "log-success",
    } as any);
    vi.mocked(prisma.executedAgentAction.update).mockResolvedValue({} as any);

    const bulkArchiveFromSenders = vi.fn().mockResolvedValue({
      totalArchived: 12,
    });
    vi.mocked(createEmailProvider).mockResolvedValue({
      bulkArchiveFromSenders,
    } as any);

    const tool = bulkArchiveTool({
      emailAccountId: "ea-1",
      emailAccountEmail: "user@example.com",
      provider: "gmail",
      resourceType: "email",
      logger,
    } as any);
    const result = await tool.execute({
      senders: ["a@example.com", "b@example.com"],
    });

    expect(result).toEqual({
      archived: 12,
      senders: 2,
      logId: "log-success",
    });
    expect(prisma.executedAgentAction.update).toHaveBeenCalledWith({
      where: { id: "log-success" },
      data: { status: "SUCCESS" },
    });
  });
});
