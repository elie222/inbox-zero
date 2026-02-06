import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { applySettingsUpdate } from "./settings";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");

describe("applySettingsUpdate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("upserts allowed action deterministically for null resourceType", async () => {
    vi.mocked(prisma.allowedAction.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.allowedAction.create).mockResolvedValue({
      id: "action-1",
    } as any);
    vi.mocked(prisma.allowedAction.deleteMany).mockResolvedValue({
      count: 0,
    } as any);

    await applySettingsUpdate({
      emailAccountId: "ea-1",
      payload: {
        allowedActions: [
          {
            actionType: "archive",
            resourceType: null,
            enabled: true,
          },
        ],
      },
    });

    expect(prisma.allowedAction.findFirst).toHaveBeenCalledWith({
      where: {
        emailAccountId: "ea-1",
        actionType: "archive",
        resourceType: null,
      },
      select: { id: true },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });
    expect(prisma.allowedAction.create).toHaveBeenCalledWith({
      data: {
        emailAccountId: "ea-1",
        actionType: "archive",
        resourceType: null,
        enabled: true,
        config: undefined,
        conditions: undefined,
      },
    });
    expect(prisma.allowedAction.deleteMany).toHaveBeenCalledWith({
      where: {
        emailAccountId: "ea-1",
        actionType: "archive",
        resourceType: null,
        NOT: { id: "action-1" },
      },
    });
  });

  it("updates existing allowed action instead of creating duplicates", async () => {
    vi.mocked(prisma.allowedAction.findFirst).mockResolvedValue({
      id: "action-existing",
    } as any);
    vi.mocked(prisma.allowedAction.update).mockResolvedValue({
      id: "action-existing",
    } as any);
    vi.mocked(prisma.allowedAction.deleteMany).mockResolvedValue({
      count: 0,
    } as any);

    await applySettingsUpdate({
      emailAccountId: "ea-1",
      payload: {
        allowedActions: [{ actionType: "archive", resourceType: null }],
      },
    });

    expect(prisma.allowedAction.update).toHaveBeenCalledWith({
      where: { id: "action-existing" },
      data: {
        enabled: true,
        config: undefined,
        conditions: undefined,
      },
    });
    expect(prisma.allowedAction.create).not.toHaveBeenCalled();
  });

  it("upserts allowed action options with null externalId deterministically", async () => {
    vi.mocked(prisma.allowedActionOption.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.allowedActionOption.create).mockResolvedValue({
      id: "opt-1",
    } as any);
    vi.mocked(prisma.allowedActionOption.deleteMany).mockResolvedValue({
      count: 0,
    } as any);

    await applySettingsUpdate({
      emailAccountId: "ea-1",
      payload: {
        allowedActionOptions: [
          {
            actionType: "classify",
            resourceType: null,
            provider: "gmail",
            kind: "label",
            name: "Newsletter",
          },
        ],
      },
    });

    expect(prisma.allowedActionOption.findFirst).toHaveBeenCalledWith({
      where: {
        emailAccountId: "ea-1",
        actionType: "classify",
        resourceType: null,
        provider: "gmail",
        kind: "label",
        name: "Newsletter",
        externalId: null,
      },
      select: { id: true },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });
    expect(prisma.allowedActionOption.create).toHaveBeenCalledWith({
      data: {
        emailAccountId: "ea-1",
        actionType: "classify",
        resourceType: null,
        provider: "gmail",
        kind: "label",
        name: "Newsletter",
        externalId: null,
        targetGroupId: null,
      },
    });
    expect(prisma.allowedActionOption.deleteMany).toHaveBeenCalledWith({
      where: {
        emailAccountId: "ea-1",
        actionType: "classify",
        resourceType: null,
        provider: "gmail",
        kind: "label",
        name: "Newsletter",
        externalId: null,
        NOT: { id: "opt-1" },
      },
    });
  });
});
