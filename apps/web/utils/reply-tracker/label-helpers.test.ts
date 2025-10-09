import { describe, expect, test, vi, beforeEach } from "vitest";
import {
  applyThreadStatusLabel,
  removeAllThreadStatusLabels,
} from "./label-helpers";
import type { EmailProvider } from "@/utils/email/types";
import prisma from "@/utils/__mocks__/prisma";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/logger", () => ({
  createScopedLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
  }),
}));

describe("applyThreadStatusLabel", () => {
  let mockProvider: EmailProvider;
  const emailAccountId = "test-account-id";
  const threadId = "test-thread-id";
  const messageId = "test-message-id";

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock email provider methods
    mockProvider = {
      labelMessage: vi.fn().mockResolvedValue(undefined),
      removeThreadLabel: vi.fn().mockResolvedValue(undefined),
      getLabels: vi.fn().mockResolvedValue([
        { id: "label-needs-reply", name: "To Reply" },
        { id: "label-awaiting-reply", name: "Awaiting Reply" },
        { id: "label-fyi", name: "FYI" },
        { id: "label-actioned", name: "Actioned" },
      ]),
      createLabel: vi.fn().mockImplementation(async (name: string) => ({
        id: `label-${name.toLowerCase().replace(" ", "-")}`,
        name,
      })),
    } as unknown as EmailProvider;

    // Mock prisma to return rules with label IDs
    vi.mocked(prisma.rule.findMany).mockResolvedValue([
      {
        id: "rule-1",
        systemType: "TO_REPLY",
        actions: [
          { id: "action-1", type: "LABEL", labelId: "label-needs-reply" },
        ],
      },
      {
        id: "rule-2",
        systemType: "AWAITING_REPLY",
        actions: [
          { id: "action-2", type: "LABEL", labelId: "label-awaiting-reply" },
        ],
      },
      {
        id: "rule-3",
        systemType: "FYI",
        actions: [{ id: "action-3", type: "LABEL", labelId: "label-fyi" }],
      },
      {
        id: "rule-4",
        systemType: "ACTIONED",
        actions: [{ id: "action-4", type: "LABEL", labelId: "label-actioned" }],
      },
    ] as any);

    vi.mocked(prisma.action.update).mockResolvedValue({} as any);
    vi.mocked(prisma.action.create).mockResolvedValue({} as any);
  });

  test("applies TO_REPLY label and removes other thread status labels", async () => {
    await applyThreadStatusLabel({
      emailAccountId,
      threadId,
      messageId,
      status: "TO_REPLY",
      provider: mockProvider,
    });

    // Should apply TO_REPLY label to message
    expect(mockProvider.labelMessage).toHaveBeenCalledWith({
      messageId,
      labelId: "label-needs-reply",
    });

    // Should remove other thread status labels from thread
    expect(mockProvider.removeThreadLabel).toHaveBeenCalledWith(
      threadId,
      "label-awaiting-reply",
    );
    expect(mockProvider.removeThreadLabel).toHaveBeenCalledWith(
      threadId,
      "label-fyi",
    );
    expect(mockProvider.removeThreadLabel).toHaveBeenCalledWith(
      threadId,
      "label-actioned",
    );

    // Should not remove the label we're applying
    expect(mockProvider.removeThreadLabel).not.toHaveBeenCalledWith(
      threadId,
      "label-needs-reply",
    );
  });

  test("applies AWAITING_REPLY label and removes other thread status labels", async () => {
    await applyThreadStatusLabel({
      emailAccountId,
      threadId,
      messageId,
      status: "AWAITING_REPLY",
      provider: mockProvider,
    });

    // Should apply AWAITING_REPLY label to message
    expect(mockProvider.labelMessage).toHaveBeenCalledWith({
      messageId,
      labelId: "label-awaiting-reply",
    });

    // Should remove other thread status labels
    expect(mockProvider.removeThreadLabel).toHaveBeenCalledWith(
      threadId,
      "label-needs-reply",
    );
    expect(mockProvider.removeThreadLabel).toHaveBeenCalledWith(
      threadId,
      "label-fyi",
    );
    expect(mockProvider.removeThreadLabel).toHaveBeenCalledWith(
      threadId,
      "label-actioned",
    );
  });

  test("applies FYI label and removes other thread status labels", async () => {
    await applyThreadStatusLabel({
      emailAccountId,
      threadId,
      messageId,
      status: "FYI",
      provider: mockProvider,
    });

    expect(mockProvider.labelMessage).toHaveBeenCalledWith({
      messageId,
      labelId: "label-fyi",
    });

    expect(mockProvider.removeThreadLabel).toHaveBeenCalledWith(
      threadId,
      "label-needs-reply",
    );
    expect(mockProvider.removeThreadLabel).toHaveBeenCalledWith(
      threadId,
      "label-awaiting-reply",
    );
    expect(mockProvider.removeThreadLabel).toHaveBeenCalledWith(
      threadId,
      "label-actioned",
    );
  });

  test("applies ACTIONED label and removes other thread status labels", async () => {
    await applyThreadStatusLabel({
      emailAccountId,
      threadId,
      messageId,
      status: "ACTIONED",
      provider: mockProvider,
    });

    expect(mockProvider.labelMessage).toHaveBeenCalledWith({
      messageId,
      labelId: "label-actioned",
    });

    expect(mockProvider.removeThreadLabel).toHaveBeenCalledWith(
      threadId,
      "label-needs-reply",
    );
    expect(mockProvider.removeThreadLabel).toHaveBeenCalledWith(
      threadId,
      "label-awaiting-reply",
    );
    expect(mockProvider.removeThreadLabel).toHaveBeenCalledWith(
      threadId,
      "label-fyi",
    );
  });

  test("handles errors gracefully when removing labels fails", async () => {
    // Make removeThreadLabel fail for one label
    vi.mocked(mockProvider.removeThreadLabel).mockRejectedValueOnce(
      new Error("Failed to remove label"),
    );

    // Should not throw
    await expect(
      applyThreadStatusLabel({
        emailAccountId,
        threadId,
        messageId,
        status: "TO_REPLY",
        provider: mockProvider,
      }),
    ).resolves.not.toThrow();

    // Should still apply the target label
    expect(mockProvider.labelMessage).toHaveBeenCalledWith({
      messageId,
      labelId: "label-needs-reply",
    });
  });

  test("handles errors gracefully when applying label fails", async () => {
    vi.mocked(mockProvider.labelMessage).mockRejectedValueOnce(
      new Error("Failed to apply label"),
    );

    // Should not throw
    await expect(
      applyThreadStatusLabel({
        emailAccountId,
        threadId,
        messageId,
        status: "FYI",
        provider: mockProvider,
      }),
    ).resolves.not.toThrow();

    // Should still attempt to remove other labels
    expect(mockProvider.removeThreadLabel).toHaveBeenCalled();
  });
});

describe("removeAllThreadStatusLabels", () => {
  let mockProvider: EmailProvider;
  const emailAccountId = "test-account-id";
  const threadId = "test-thread-id";

  beforeEach(() => {
    vi.clearAllMocks();

    mockProvider = {
      removeThreadLabel: vi.fn().mockResolvedValue(undefined),
      getLabels: vi.fn().mockResolvedValue([
        { id: "label-needs-reply", name: "To Reply" },
        { id: "label-awaiting-reply", name: "Awaiting Reply" },
        { id: "label-fyi", name: "FYI" },
        { id: "label-actioned", name: "Actioned" },
      ]),
    } as unknown as EmailProvider;

    // Mock prisma to return rules with label IDs
    vi.mocked(prisma.rule.findMany).mockResolvedValue([
      {
        id: "rule-1",
        systemType: "TO_REPLY",
        actions: [
          { id: "action-1", type: "LABEL", labelId: "label-needs-reply" },
        ],
      },
      {
        id: "rule-2",
        systemType: "AWAITING_REPLY",
        actions: [
          { id: "action-2", type: "LABEL", labelId: "label-awaiting-reply" },
        ],
      },
      {
        id: "rule-3",
        systemType: "FYI",
        actions: [{ id: "action-3", type: "LABEL", labelId: "label-fyi" }],
      },
      {
        id: "rule-4",
        systemType: "ACTIONED",
        actions: [{ id: "action-4", type: "LABEL", labelId: "label-actioned" }],
      },
    ] as any);
  });

  test("removes all thread status labels", async () => {
    await removeAllThreadStatusLabels({
      emailAccountId,
      threadId,
      provider: mockProvider,
    });

    expect(mockProvider.removeThreadLabel).toHaveBeenCalledWith(
      threadId,
      "label-needs-reply",
    );
    expect(mockProvider.removeThreadLabel).toHaveBeenCalledWith(
      threadId,
      "label-awaiting-reply",
    );
    expect(mockProvider.removeThreadLabel).toHaveBeenCalledWith(
      threadId,
      "label-fyi",
    );
    expect(mockProvider.removeThreadLabel).toHaveBeenCalledWith(
      threadId,
      "label-actioned",
    );
  });

  test("handles errors gracefully", async () => {
    vi.mocked(mockProvider.removeThreadLabel).mockRejectedValue(
      new Error("Failed to remove"),
    );

    // Should not throw
    await expect(
      removeAllThreadStatusLabels({
        emailAccountId,
        threadId,
        provider: mockProvider,
      }),
    ).resolves.not.toThrow();
  });
});
