import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getOrCreateFollowUpLabel,
  applyFollowUpLabel,
  removeFollowUpLabel,
  hasFollowUpLabel,
  clearFollowUpLabel,
} from "./labels";
import { getMockMessage } from "@/__tests__/helpers";
import { createScopedLogger } from "@/utils/logger";
import { createMockEmailProvider } from "@/__tests__/mocks/email-provider.mock";
import prisma from "@/utils/__mocks__/prisma";

vi.mock("@/utils/prisma");

const logger = createScopedLogger("test");

describe("getOrCreateFollowUpLabel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns existing label if found", async () => {
    const mockProvider = createMockEmailProvider({
      getLabelByName: vi
        .fn()
        .mockResolvedValue({ id: "label-123", name: "Follow-up" }),
    });

    const result = await getOrCreateFollowUpLabel(mockProvider);

    expect(result).toEqual({ id: "label-123", name: "Follow-up" });
    expect(mockProvider.getLabelByName).toHaveBeenCalledWith("Follow-up");
    expect(mockProvider.createLabel).not.toHaveBeenCalled();
  });

  it("creates new label if not found", async () => {
    const mockProvider = createMockEmailProvider({
      getLabelByName: vi.fn().mockResolvedValue(null),
      createLabel: vi
        .fn()
        .mockResolvedValue({ id: "new-label-456", name: "Follow-up" }),
    });

    const result = await getOrCreateFollowUpLabel(mockProvider);

    expect(result).toEqual({ id: "new-label-456", name: "Follow-up" });
    expect(mockProvider.getLabelByName).toHaveBeenCalledWith("Follow-up");
    expect(mockProvider.createLabel).toHaveBeenCalledWith("Follow-up");
  });
});

describe("applyFollowUpLabel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applies label to message", async () => {
    const mockProvider = createMockEmailProvider({
      getLabelByName: vi
        .fn()
        .mockResolvedValue({ id: "label-123", name: "Follow-up" }),
      labelMessage: vi.fn().mockResolvedValue(undefined),
    });

    await applyFollowUpLabel({
      provider: mockProvider,
      threadId: "thread-1",
      messageId: "msg-1",
      logger,
    });

    expect(mockProvider.labelMessage).toHaveBeenCalledWith({
      messageId: "msg-1",
      labelId: "label-123",
      labelName: "Follow-up",
    });
  });

  it("creates label if not exists before applying", async () => {
    const mockProvider = createMockEmailProvider({
      getLabelByName: vi.fn().mockResolvedValue(null),
      createLabel: vi
        .fn()
        .mockResolvedValue({ id: "new-label", name: "Follow-up" }),
      labelMessage: vi.fn().mockResolvedValue(undefined),
    });

    await applyFollowUpLabel({
      provider: mockProvider,
      threadId: "thread-1",
      messageId: "msg-1",
      logger,
    });

    expect(mockProvider.createLabel).toHaveBeenCalledWith("Follow-up");
    expect(mockProvider.labelMessage).toHaveBeenCalledWith({
      messageId: "msg-1",
      labelId: "new-label",
      labelName: "Follow-up",
    });
  });
});

describe("removeFollowUpLabel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("removes label from thread if exists", async () => {
    const mockProvider = createMockEmailProvider({
      getLabelByName: vi
        .fn()
        .mockResolvedValue({ id: "label-123", name: "Follow-up" }),
      removeThreadLabel: vi.fn().mockResolvedValue(undefined),
    });

    await removeFollowUpLabel({
      provider: mockProvider,
      threadId: "thread-1",
      logger,
    });

    expect(mockProvider.removeThreadLabel).toHaveBeenCalledWith(
      "thread-1",
      "label-123",
    );
  });

  it("does nothing if label does not exist", async () => {
    const mockProvider = createMockEmailProvider({
      getLabelByName: vi.fn().mockResolvedValue(null),
    });

    await removeFollowUpLabel({
      provider: mockProvider,
      threadId: "thread-1",
      logger,
    });

    expect(mockProvider.removeThreadLabel).not.toHaveBeenCalled();
  });

  it("handles error when removing label (label not on thread)", async () => {
    const mockProvider = createMockEmailProvider({
      getLabelByName: vi
        .fn()
        .mockResolvedValue({ id: "label-123", name: "Follow-up" }),
      removeThreadLabel: vi
        .fn()
        .mockRejectedValue(new Error("Label not on thread")),
    });

    await expect(
      removeFollowUpLabel({
        provider: mockProvider,
        threadId: "thread-1",
        logger,
      }),
    ).resolves.not.toThrow();
  });
});

describe("hasFollowUpLabel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true if any message has the label", async () => {
    const mockProvider = createMockEmailProvider({
      getLabelByName: vi
        .fn()
        .mockResolvedValue({ id: "label-123", name: "Follow-up" }),
      getThread: vi.fn().mockResolvedValue({
        id: "thread-1",
        messages: [
          getMockMessage({ id: "msg-1", labelIds: ["other-label"] }),
          getMockMessage({ id: "msg-2", labelIds: ["label-123", "another"] }),
        ],
      }),
    });

    const result = await hasFollowUpLabel({
      provider: mockProvider,
      threadId: "thread-1",
      logger,
    });

    expect(result).toBe(true);
  });

  it("returns false if no message has the label", async () => {
    const mockProvider = createMockEmailProvider({
      getLabelByName: vi
        .fn()
        .mockResolvedValue({ id: "label-123", name: "Follow-up" }),
      getThread: vi.fn().mockResolvedValue({
        id: "thread-1",
        messages: [
          getMockMessage({ id: "msg-1", labelIds: ["other-label"] }),
          getMockMessage({ id: "msg-2", labelIds: ["another"] }),
        ],
      }),
    });

    const result = await hasFollowUpLabel({
      provider: mockProvider,
      threadId: "thread-1",
      logger,
    });

    expect(result).toBe(false);
  });

  it("returns false if label does not exist", async () => {
    const mockProvider = createMockEmailProvider({
      getLabelByName: vi.fn().mockResolvedValue(null),
    });

    const result = await hasFollowUpLabel({
      provider: mockProvider,
      threadId: "thread-1",
      logger,
    });

    expect(result).toBe(false);
    expect(mockProvider.getThread).not.toHaveBeenCalled();
  });

  it("returns false if thread has no messages", async () => {
    const mockProvider = createMockEmailProvider({
      getLabelByName: vi
        .fn()
        .mockResolvedValue({ id: "label-123", name: "Follow-up" }),
      getThread: vi.fn().mockResolvedValue({
        id: "thread-1",
        messages: [],
      }),
    });

    const result = await hasFollowUpLabel({
      provider: mockProvider,
      threadId: "thread-1",
      logger,
    });

    expect(result).toBe(false);
  });

  it("returns false on error", async () => {
    const mockProvider = createMockEmailProvider({
      getLabelByName: vi
        .fn()
        .mockResolvedValue({ id: "label-123", name: "Follow-up" }),
      getThread: vi.fn().mockRejectedValue(new Error("Thread not found")),
    });

    const result = await hasFollowUpLabel({
      provider: mockProvider,
      threadId: "thread-1",
      logger,
    });

    expect(result).toBe(false);
  });
});

describe("clearFollowUpLabel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("removes label and clears tracker when thread has follow-up label in DB", async () => {
    const mockProvider = createMockEmailProvider({
      getLabelByName: vi
        .fn()
        .mockResolvedValue({ id: "label-123", name: "Follow-up" }),
    });

    prisma.threadTracker.updateMany.mockResolvedValue({ count: 1 });

    await clearFollowUpLabel({
      emailAccountId: "account-1",
      threadId: "thread-1",
      provider: mockProvider,
      logger,
    });

    expect(prisma.threadTracker.updateMany).toHaveBeenCalledWith({
      where: {
        emailAccountId: "account-1",
        threadId: "thread-1",
        followUpAppliedAt: { not: null },
        resolved: false,
      },
      data: {
        followUpAppliedAt: null,
      },
    });
    expect(mockProvider.removeThreadLabel).toHaveBeenCalledWith(
      "thread-1",
      "label-123",
    );
  });

  it("does nothing when no trackers updated", async () => {
    const mockProvider = createMockEmailProvider();
    prisma.threadTracker.updateMany.mockResolvedValue({ count: 0 });

    await clearFollowUpLabel({
      emailAccountId: "account-1",
      threadId: "thread-1",
      provider: mockProvider,
      logger,
    });

    expect(mockProvider.removeThreadLabel).not.toHaveBeenCalled();
  });
});
