import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createTestLogger } from "@/__tests__/helpers";
import {
  confirmAssistantTrashThreadsForAccount,
  dismissAssistantTrashThreadsForAccount,
} from "@/utils/actions/assistant-chat-confirmation";
import { manageInboxTool } from "@/utils/ai/assistant/chat-inbox-tools";
import { addChatActionTotals } from "@/utils/ai/assistant/chat-action-totals";
import { createEmailProvider } from "@/utils/email/provider";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/email/provider");
vi.mock("@/utils/ai/assistant/chat-action-totals");
vi.mock("@/utils/posthog", () => ({
  posthogCaptureEvent: vi.fn(),
  getPosthogLlmClient: () => null,
}));

const logger = createTestLogger();
const trashThread = vi.fn();

describe("chat trash confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    trashThread.mockResolvedValue(undefined);
    vi.mocked(createEmailProvider).mockResolvedValue({ trashThread } as any);
    vi.mocked(addChatActionTotals).mockResolvedValue({});
    prisma.emailAccount.findUnique.mockResolvedValue({
      email: "user@test.com",
    } as any);
    prisma.chatMessage.updateMany.mockResolvedValue({ count: 1 });
  });

  it("does not trash anything when chat asks to trash threads", async () => {
    const output = await runTrashTool("web");

    expect(trashThread).not.toHaveBeenCalled();
    expect(addChatActionTotals).not.toHaveBeenCalled();
    expect(output).toMatchObject({
      actionType: "trash_threads",
      requiresConfirmation: true,
      confirmationState: "pending",
      pendingAction: { threadIds: ["thread-1", "thread-2"] },
    });
  });

  it("refuses to trash on messaging surfaces, which have no confirmation", async () => {
    const output = await runTrashTool("messaging");

    expect(trashThread).not.toHaveBeenCalled();
    expect(output).toHaveProperty("error");
    expect(output).not.toHaveProperty("requiresConfirmation");
  });

  it("trashes the threads once the user confirms", async () => {
    mockChatMessage(await runTrashTool("web"));

    const result = await confirm();

    expect(trashThread).toHaveBeenCalledTimes(2);
    expect(trashThread).toHaveBeenCalledWith(
      "thread-1",
      "user@test.com",
      "user",
    );
    expect(trashThread).toHaveBeenCalledWith(
      "thread-2",
      "user@test.com",
      "user",
    );
    expect(result.confirmationResult).toMatchObject({
      successCount: 2,
      failedThreadIds: [],
    });
    expect(addChatActionTotals).toHaveBeenCalledWith({
      chatId: "chat-1",
      counts: { threads_trashed: 2 },
    });

    const confirmedParts = (
      prisma.chatMessage.updateMany.mock.calls.at(-1)![0] as any
    ).data.parts;
    expect(confirmedParts[0].output).toMatchObject({
      confirmationState: "confirmed",
      confirmationResult: { successCount: 2, failedThreadIds: [] },
    });
  });

  it("reports threads the provider failed to trash", async () => {
    mockChatMessage(await runTrashTool("web"));
    trashThread
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("provider down"));

    const result = await confirm();

    expect(result.confirmationResult).toMatchObject({
      successCount: 1,
      failedThreadIds: ["thread-2"],
    });
  });

  it("keeps the card retryable when no thread could be trashed", async () => {
    mockChatMessage(await runTrashTool("web"));
    trashThread.mockRejectedValue(new Error("provider down"));

    await expect(confirm()).rejects.toThrow(
      "Couldn't move these emails to trash.",
    );

    expect(addChatActionTotals).not.toHaveBeenCalled();
    const savedStates = prisma.chatMessage.updateMany.mock.calls.map(
      ([args]: any) => args.data.parts[0].output.confirmationState,
    );
    expect(savedStates).not.toContain("confirmed");
  });

  it("does not count totals when the confirmed result can't be saved", async () => {
    mockChatMessage(await runTrashTool("web"));
    // The reservation succeeds, then every attempt to save the result loses.
    prisma.chatMessage.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValue({ count: 0 });

    await expect(confirm()).rejects.toThrow();

    expect(addChatActionTotals).not.toHaveBeenCalled();
  });

  it("does not count totals when an overlapping confirmation saved first", async () => {
    const pending = await runTrashTool("web");
    const confirmedOutput = {
      ...pending,
      confirmationState: "confirmed",
      confirmationResult: {
        successCount: 2,
        failedThreadIds: [],
        confirmedAt: "2026-11-13T00:00:00.000Z",
      },
    };
    // This request reserves the pending action, then finds it already saved.
    prisma.chatMessage.findFirst
      .mockResolvedValueOnce(chatMessageWith(pending) as any)
      .mockResolvedValue(chatMessageWith(confirmedOutput) as any);

    await confirm();

    expect(trashThread).toHaveBeenCalledTimes(2);
    expect(addChatActionTotals).not.toHaveBeenCalled();
  });

  it("does not trash again when the action was already confirmed", async () => {
    const pending = await runTrashTool("web");
    mockChatMessage({
      ...pending,
      confirmationState: "confirmed",
      confirmationResult: {
        successCount: 2,
        failedThreadIds: [],
        confirmedAt: "2026-11-13T00:00:00.000Z",
      },
    });

    const result = await confirm();

    expect(trashThread).not.toHaveBeenCalled();
    expect(result.confirmationResult?.successCount).toBe(2);
  });
});

describe("chat trash cancellation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    trashThread.mockResolvedValue(undefined);
    vi.mocked(createEmailProvider).mockResolvedValue({ trashThread } as any);
    prisma.chatMessage.updateMany.mockResolvedValue({ count: 1 });
  });

  it("marks a pending trash as cancelled without trashing anything", async () => {
    mockChatMessage(await runTrashTool("web"));

    const result = await dismiss();

    expect(result.confirmationState).toBe("cancelled");
    expect(trashThread).not.toHaveBeenCalled();
    const savedParts = (
      prisma.chatMessage.updateMany.mock.calls.at(-1)![0] as any
    ).data.parts;
    expect(savedParts[0].output.confirmationState).toBe("cancelled");
  });

  it("refuses to trash after the user cancelled", async () => {
    mockChatMessage({
      ...(await runTrashTool("web")),
      confirmationState: "cancelled",
    });

    await expect(confirm()).rejects.toThrow("This action was cancelled.");
    expect(trashThread).not.toHaveBeenCalled();
  });

  it("does not cancel once a confirmation has started", async () => {
    mockChatMessage({
      ...(await runTrashTool("web")),
      confirmationState: "processing",
      confirmationProcessingAt: new Date().toISOString(),
    });

    await expect(dismiss()).rejects.toThrow("This action has already started.");
    expect(prisma.chatMessage.updateMany).not.toHaveBeenCalled();
  });
});

function dismiss() {
  return dismissAssistantTrashThreadsForAccount({
    chatId: "chat-1",
    chatMessageId: "chat-message-1",
    toolCallId: "tool-1",
    emailAccountId: "ea_1",
    logger,
  });
}

async function runTrashTool(responseSurface: "web" | "messaging") {
  const toolInstance = manageInboxTool({
    email: "user@test.com",
    emailAccountId: "ea_1",
    provider: "google",
    logger,
    chatId: "chat-1",
    responseSurface,
  });
  return (toolInstance.execute as any)({
    action: "trash_threads",
    threadIds: ["thread-1", "thread-2"],
  });
}

function confirm() {
  return confirmAssistantTrashThreadsForAccount({
    chatId: "chat-1",
    chatMessageId: "chat-message-1",
    toolCallId: "tool-1",
    emailAccountId: "ea_1",
    provider: "google",
    logger,
  });
}

function mockChatMessage(output: unknown) {
  prisma.chatMessage.findFirst.mockResolvedValue(
    chatMessageWith(output) as any,
  );
}

function chatMessageWith(output: unknown) {
  return {
    id: "chat-message-1",
    chatId: "chat-1",
    updatedAt: new Date("2026-11-13T00:00:00.000Z"),
    parts: [
      {
        type: "tool-manageInbox",
        toolCallId: "tool-1",
        state: "output-available",
        input: { action: "trash_threads" },
        output,
      },
    ],
  };
}
