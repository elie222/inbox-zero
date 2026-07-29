import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

const {
  createEmailProviderMock,
  getEmailAccountWithAiAndTokensMock,
  aiGenerateFolderInstructionsMock,
  createRuleMock,
  deleteRuleMock,
} = vi.hoisted(() => ({
  createEmailProviderMock: vi.fn(),
  getEmailAccountWithAiAndTokensMock: vi.fn(),
  aiGenerateFolderInstructionsMock: vi.fn(),
  createRuleMock: vi.fn(),
  deleteRuleMock: vi.fn(),
}));

vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "user@example.com" },
  })),
}));
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: createEmailProviderMock,
}));
vi.mock("@/utils/user/get", () => ({
  getEmailAccountWithAiAndTokens: getEmailAccountWithAiAndTokensMock,
}));
vi.mock("@/utils/ai/label/generate-folder-instructions", () => ({
  aiGenerateFolderInstructions: aiGenerateFolderInstructionsMock,
}));
vi.mock("@/utils/rule/rule", () => ({
  createRule: createRuleMock,
  deleteRule: deleteRuleMock,
}));

import {
  generateFolderInstructionsAction,
  setFolderAutoReadAction,
} from "@/utils/actions/folder-rule";

beforeEach(() => {
  vi.clearAllMocks();

  prisma.emailAccount.findUnique.mockResolvedValue({
    email: "user@example.com",
    account: {
      userId: "user-1",
      provider: "google",
    },
  } as any);
  getEmailAccountWithAiAndTokensMock.mockResolvedValue({
    id: "account-1",
    email: "user@example.com",
    user: {},
  });
});

describe("generateFolderInstructionsAction", () => {
  it("returns the AI draft built from the folder's recent emails", async () => {
    createEmailProviderMock.mockResolvedValue({
      getThreadsWithLabel: vi.fn().mockResolvedValue([
        {
          id: "thread-1",
          messages: [
            {
              id: "message-1",
              headers: { from: "billing@stripe.com", subject: "Receipt" },
            },
          ],
        },
      ]),
    });
    aiGenerateFolderInstructionsMock.mockResolvedValue({
      instructions: "Receipts and invoices",
      senderPatterns: ["billing@stripe.com"],
    });

    const result = await generateFolderInstructionsAction("account-1", {
      labelId: "Label_1",
      labelName: "Billing",
    });

    expect(result?.data).toEqual({
      instructions: "Receipts and invoices",
      senderPatterns: ["billing@stripe.com"],
    });
  });

  it("explains when the folder has no emails to learn from", async () => {
    createEmailProviderMock.mockResolvedValue({
      getThreadsWithLabel: vi.fn().mockResolvedValue([]),
    });

    const result = await generateFolderInstructionsAction("account-1", {
      labelId: "Label_1",
      labelName: "Billing",
    });

    expect(result?.serverError).toContain("no emails to learn from");
    expect(aiGenerateFolderInstructionsMock).not.toHaveBeenCalled();
  });

  it("surfaces the underlying cause when the AI call fails, even for non-Error throwables", async () => {
    createEmailProviderMock.mockResolvedValue({
      getThreadsWithLabel: vi.fn().mockResolvedValue([
        {
          id: "thread-1",
          messages: [
            {
              id: "message-1",
              headers: { from: "billing@stripe.com", subject: "Receipt" },
            },
          ],
        },
      ]),
    });
    // DOMException-like: has name/message but is not an Error instance
    aiGenerateFolderInstructionsMock.mockRejectedValue({
      name: "AbortError",
      message: "The operation was aborted",
    });

    const result = await generateFolderInstructionsAction("account-1", {
      labelId: "Label_1",
      labelName: "Billing",
    });

    expect(result?.serverError).toContain(
      "AbortError: The operation was aborted",
    );
  });
});

describe("setFolderAutoReadAction", () => {
  beforeEach(() => {
    prisma.rule.findFirst.mockResolvedValue(null);
    prisma.rule.findUnique.mockResolvedValue(null);
  });

  it("adds a mark-read action to the folder's own rule for 'all'", async () => {
    prisma.rule.findFirst.mockResolvedValue({
      id: "rule-1",
      actions: [{ id: "act-1", type: "LABEL" }],
    } as never);

    await setFolderAutoReadAction("account-1", {
      labelId: "Label_1",
      labelName: "Billing",
      mode: "all",
    });

    expect(prisma.action.create).toHaveBeenCalledWith({
      data: {
        ruleId: "rule-1",
        emailAccountId: "account-1",
        type: "MARK_READ",
      },
    });
    expect(createRuleMock).not.toHaveBeenCalled();
  });

  it("refuses 'all' when the folder has no filing rule to hang it on", async () => {
    const result = await setFolderAutoReadAction("account-1", {
      labelId: "Label_1",
      labelName: "Billing",
      mode: "all",
    });

    expect(result?.serverError).toBeDefined();
    expect(prisma.action.create).not.toHaveBeenCalled();
  });

  it("creates a companion rule that files and marks read for 'only'", async () => {
    await setFolderAutoReadAction("account-1", {
      labelId: "Label_1",
      labelName: "Billing",
      mode: "only",
      senders: "noreply@acme.com, @news.example.com",
    });

    expect(createRuleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        result: expect.objectContaining({
          name: "Mark read: Billing",
          condition: expect.objectContaining({
            static: expect.objectContaining({
              from: "noreply@acme.com, @news.example.com",
            }),
          }),
          actions: [
            { type: "LABEL", fields: { label: "Billing" } },
            { type: "MARK_READ" },
          ],
        }),
        staticExcludes: expect.objectContaining({ fromExclude: false }),
      }),
    );
  });

  it("inverts the companion rule's match for 'except'", async () => {
    await setFolderAutoReadAction("account-1", {
      labelId: "Label_1",
      labelName: "Billing",
      mode: "except",
      senders: "boss@acme.com",
    });

    expect(createRuleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        staticExcludes: expect.objectContaining({ fromExclude: true }),
      }),
    );
  });

  it("drops both mechanisms when turned off", async () => {
    prisma.rule.findFirst.mockResolvedValue({
      id: "rule-1",
      actions: [
        { id: "act-1", type: "LABEL" },
        { id: "act-2", type: "MARK_READ" },
      ],
    } as never);
    prisma.rule.findUnique.mockResolvedValue({ id: "companion-1" } as never);

    await setFolderAutoReadAction("account-1", {
      labelId: "Label_1",
      labelName: "Billing",
      mode: "off",
    });

    expect(prisma.action.delete).toHaveBeenCalledWith({
      where: { id: "act-2" },
    });
    expect(deleteRuleMock).toHaveBeenCalledWith({
      emailAccountId: "account-1",
      ruleId: "companion-1",
    });
  });

  it("requires senders for a scoped mode", async () => {
    const result = await setFolderAutoReadAction("account-1", {
      labelId: "Label_1",
      labelName: "Billing",
      mode: "only",
      senders: "   ",
    });

    expect(result?.validationErrors).toBeDefined();
    expect(createRuleMock).not.toHaveBeenCalled();
  });
});
