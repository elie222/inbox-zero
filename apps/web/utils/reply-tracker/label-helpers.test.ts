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

    // Mock prisma to return all label IDs
    vi.mocked(prisma.emailAccount.findUnique).mockResolvedValue({
      id: emailAccountId,
      needsReplyLabelId: "label-needs-reply",
      awaitingReplyLabelId: "label-awaiting-reply",
      fyiLabelId: "label-fyi",
      actionedLabelId: "label-actioned",
    } as any);

    vi.mocked(prisma.emailAccount.update).mockResolvedValue({} as any);
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

    // Mock prisma to return all label IDs
    vi.mocked(prisma.emailAccount.findUnique).mockResolvedValue({
      id: emailAccountId,
      needsReplyLabelId: "label-needs-reply",
      awaitingReplyLabelId: "label-awaiting-reply",
      fyiLabelId: "label-fyi",
      actionedLabelId: "label-actioned",
    } as any);
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
