import { describe, expect, test, vi, beforeEach } from "vitest";
import { applyThreadStatusLabel } from "./label-helpers";
import type { EmailProvider } from "@/utils/email/types";
import prisma from "@/utils/__mocks__/prisma";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");

describe("applyThreadStatusLabel", () => {
  let mockProvider: EmailProvider;
  const emailAccountId = "test-account-id";
  const threadId = "test-thread-id";
  const messageId = "test-message-id";

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock email provider methods
    mockProvider = {
      removeThreadLabels: vi.fn().mockResolvedValue(undefined),
      labelMessage: vi.fn().mockResolvedValue(undefined),
      getLabels: vi.fn().mockResolvedValue([
        { id: "label-to-reply", name: "To Reply", type: "user" },
        { id: "label-awaiting-reply", name: "Awaiting Reply", type: "user" },
        { id: "label-fyi", name: "FYI", type: "user" },
        { id: "label-actioned", name: "Actioned", type: "user" },
      ]),
      createLabel: vi.fn().mockImplementation(async (name: string) => ({
        id: `label-${name.toLowerCase().replace(/ /g, "-")}`,
        name,
        type: "user",
      })),
    } as unknown as EmailProvider;

    // Mock prisma to return rules with label IDs
    vi.mocked(prisma.rule.findMany).mockResolvedValue([
      {
        id: "rule-1",
        systemType: "TO_REPLY",
        actions: [{ id: "action-1", type: "LABEL", labelId: "label-to-reply" }],
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

  test("removes other labels from thread and adds target label to message for TO_REPLY", async () => {
    await applyThreadStatusLabel({
      emailAccountId,
      threadId,
      messageId,
      systemType: "TO_REPLY",
      provider: mockProvider,
    });

    // Should remove other conversation status labels from thread
    expect(mockProvider.removeThreadLabels).toHaveBeenCalledTimes(1);
    expect(mockProvider.removeThreadLabels).toHaveBeenCalledWith(
      threadId,
      expect.arrayContaining([
        "label-awaiting-reply",
        "label-fyi",
        "label-actioned",
      ]),
    );

    // Verify it doesn't remove the target label
    const removeCall = vi.mocked(mockProvider.removeThreadLabels).mock.calls[0];
    expect(removeCall[1]).not.toContain("label-to-reply");

    // Should add TO_REPLY label to the specific message
    expect(mockProvider.labelMessage).toHaveBeenCalledTimes(1);
    expect(mockProvider.labelMessage).toHaveBeenCalledWith({
      messageId,
      labelId: "label-to-reply",
    });
  });

  test("removes other labels from thread and adds target label to message for AWAITING_REPLY", async () => {
    await applyThreadStatusLabel({
      emailAccountId,
      threadId,
      messageId,
      systemType: "AWAITING_REPLY",
      provider: mockProvider,
    });

    expect(mockProvider.removeThreadLabels).toHaveBeenCalledWith(
      threadId,
      expect.arrayContaining(["label-to-reply", "label-fyi", "label-actioned"]),
    );

    expect(mockProvider.labelMessage).toHaveBeenCalledWith({
      messageId,
      labelId: "label-awaiting-reply",
    });
  });

  test("removes other labels from thread and adds target label to message for FYI", async () => {
    await applyThreadStatusLabel({
      emailAccountId,
      threadId,
      messageId,
      systemType: "FYI",
      provider: mockProvider,
    });

    expect(mockProvider.removeThreadLabels).toHaveBeenCalledWith(
      threadId,
      expect.arrayContaining([
        "label-to-reply",
        "label-awaiting-reply",
        "label-actioned",
      ]),
    );

    expect(mockProvider.labelMessage).toHaveBeenCalledWith({
      messageId,
      labelId: "label-fyi",
    });
  });

  test("removes other labels from thread and adds target label to message for ACTIONED", async () => {
    await applyThreadStatusLabel({
      emailAccountId,
      threadId,
      messageId,
      systemType: "ACTIONED",
      provider: mockProvider,
    });

    expect(mockProvider.removeThreadLabels).toHaveBeenCalledWith(
      threadId,
      expect.arrayContaining([
        "label-to-reply",
        "label-awaiting-reply",
        "label-fyi",
      ]),
    );

    expect(mockProvider.labelMessage).toHaveBeenCalledWith({
      messageId,
      labelId: "label-actioned",
    });
  });

  test("handles errors gracefully", async () => {
    vi.mocked(mockProvider.removeThreadLabels).mockRejectedValueOnce(
      new Error("Failed to remove labels"),
    );

    // Should not throw
    await expect(
      applyThreadStatusLabel({
        emailAccountId,
        threadId,
        messageId,
        systemType: "TO_REPLY",
        provider: mockProvider,
      }),
    ).resolves.not.toThrow();
  });

  test("uses provider label when label ID not in database", async () => {
    // Mock prisma to return rules without one label
    vi.mocked(prisma.rule.findMany).mockResolvedValue([
      {
        id: "rule-1",
        systemType: "TO_REPLY",
        actions: [{ id: "action-1", type: "LABEL", labelId: "label-to-reply" }],
      },
      {
        id: "rule-2",
        systemType: "AWAITING_REPLY",
        actions: [
          { id: "action-2", type: "LABEL", labelId: "label-awaiting-reply" },
        ],
      },
      // FYI is missing from DB
      {
        id: "rule-4",
        systemType: "ACTIONED",
        actions: [{ id: "action-4", type: "LABEL", labelId: "label-actioned" }],
      },
    ] as any);

    await applyThreadStatusLabel({
      emailAccountId,
      threadId,
      messageId,
      systemType: "TO_REPLY",
      provider: mockProvider,
    });

    // Should still include FYI label from provider labels
    expect(mockProvider.removeThreadLabels).toHaveBeenCalledWith(
      threadId,
      expect.arrayContaining([
        "label-awaiting-reply",
        "label-fyi", // From provider labels, not DB
        "label-actioned",
      ]),
    );
  });

  test("creates label when not found in DB or provider labels", async () => {
    // Mock prisma to return empty rules for target label
    vi.mocked(prisma.rule.findMany).mockResolvedValue([
      {
        id: "rule-2",
        systemType: "AWAITING_REPLY",
        actions: [
          {
            id: "action-2",
            type: "LABEL",
            labelId: "label-awaiting-reply",
            label: null,
          },
        ],
      },
      {
        id: "rule-3",
        systemType: "FYI",
        actions: [
          { id: "action-3", type: "LABEL", labelId: "label-fyi", label: null },
        ],
      },
      {
        id: "rule-4",
        systemType: "ACTIONED",
        actions: [
          {
            id: "action-4",
            type: "LABEL",
            labelId: "label-actioned",
            label: null,
          },
        ],
      },
    ] as any);

    // Mock provider labels without TO_REPLY
    vi.mocked(mockProvider.getLabels).mockResolvedValue([
      { id: "label-awaiting-reply", name: "Awaiting Reply", type: "user" },
      { id: "label-fyi", name: "FYI", type: "user" },
      { id: "label-actioned", name: "Actioned", type: "user" },
    ]);

    await applyThreadStatusLabel({
      emailAccountId,
      threadId,
      messageId,
      systemType: "TO_REPLY",
      provider: mockProvider,
    });

    // Should have created the label
    expect(mockProvider.createLabel).toHaveBeenCalledWith("To Reply");

    // Should use the newly created label ID
    expect(mockProvider.labelMessage).toHaveBeenCalledWith({
      messageId,
      labelId: "label-to-reply",
      labelName: "To Reply",
    });
  });

  test("handles label creation failure gracefully", async () => {
    // Mock prisma to return empty rules for target label
    vi.mocked(prisma.rule.findMany).mockResolvedValue([] as any);

    // Mock provider labels to be empty (no conflicting labels to remove)
    vi.mocked(mockProvider.getLabels).mockResolvedValue([]);

    // Mock createLabel to return null
    vi.mocked(mockProvider.createLabel).mockResolvedValue(null as any);

    await applyThreadStatusLabel({
      emailAccountId,
      threadId,
      messageId,
      systemType: "TO_REPLY",
      provider: mockProvider,
    });

    // Should NOT call removeThreadLabels since there are no conflicting labels
    expect(mockProvider.removeThreadLabels).not.toHaveBeenCalled();

    // Should not call labelMessage since label creation failed
    expect(mockProvider.labelMessage).not.toHaveBeenCalled();
  });

  test("executes remove and add operations in parallel", async () => {
    const removePromise = vi.fn().mockResolvedValue(undefined);
    const labelPromise = vi.fn().mockResolvedValue(undefined);

    vi.mocked(mockProvider.removeThreadLabels).mockImplementation(
      removePromise,
    );
    vi.mocked(mockProvider.labelMessage).mockImplementation(labelPromise);

    await applyThreadStatusLabel({
      emailAccountId,
      threadId,
      messageId,
      systemType: "FYI",
      provider: mockProvider,
    });

    // Both operations should have been called
    expect(removePromise).toHaveBeenCalled();
    expect(labelPromise).toHaveBeenCalled();
  });

  test("removes exactly 3 labels (all except target)", async () => {
    await applyThreadStatusLabel({
      emailAccountId,
      threadId,
      messageId,
      systemType: "FYI",
      provider: mockProvider,
    });

    const removeCall = vi.mocked(mockProvider.removeThreadLabels).mock.calls[0];

    // Should remove exactly 3 labels (all 4 conversation statuses minus the target)
    expect(removeCall[1]).toHaveLength(3);
  });
});
