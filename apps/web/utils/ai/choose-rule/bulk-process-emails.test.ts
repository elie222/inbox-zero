import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import {
  createTestLogger,
  getEmailAccount,
  getMockMessage,
  getRule,
} from "@/__tests__/helpers";
import { createEmailProvider } from "@/utils/email/provider";
import { runRules } from "@/utils/ai/choose-rule/run-rules";
import { bulkProcessInboxEmails } from "./bulk-process-emails";

vi.mock("@/utils/prisma");
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: vi.fn(),
}));
vi.mock("@/utils/ai/choose-rule/run-rules", () => ({
  runRules: vi.fn(),
}));

describe("bulkProcessInboxEmails", () => {
  const logger = createTestLogger();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs rules historically against the latest message per thread", async () => {
    const emailAccount = getEmailAccount();
    const olderThreadMessage = getMockMessage({
      id: "message-older",
      threadId: "thread-1",
    });
    const newerThreadMessage = {
      ...getMockMessage({
        id: "message-newer",
        threadId: "thread-1",
      }),
      date: "2026-01-02T00:00:00.000Z",
    };
    olderThreadMessage.date = "2026-01-01T00:00:00.000Z";
    const otherThreadMessage = {
      ...getMockMessage({
        id: "message-other",
        threadId: "thread-2",
      }),
      date: "2026-01-03T00:00:00.000Z",
    };
    const messages = [
      olderThreadMessage,
      newerThreadMessage,
      otherThreadMessage,
    ];
    const rules = [getRule("Archive receipts")];
    const emailProvider = {
      getInboxMessages: vi.fn().mockResolvedValue(messages),
    };

    vi.mocked(createEmailProvider).mockResolvedValue(emailProvider as never);
    prisma.rule.findMany.mockResolvedValue(rules);
    vi.mocked(runRules).mockResolvedValue([]);

    await bulkProcessInboxEmails({
      emailAccount,
      provider: "google",
      maxEmails: 10,
      skipArchive: true,
      logger,
    });

    expect(emailProvider.getInboxMessages).toHaveBeenCalledWith(10);
    expect(runRules).toHaveBeenCalledTimes(2);
    expect(
      vi.mocked(runRules).mock.calls.map(([args]) => args.message),
    ).toEqual([newerThreadMessage, otherThreadMessage]);
    expect(
      vi.mocked(runRules).mock.calls.map(([args]) => args.isHistorical),
    ).toEqual([true, true]);
    expect(runRules).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: emailProvider,
        rules,
        emailAccount,
        isTest: false,
        isHistorical: true,
        modelType: "economy",
        skipArchive: true,
      }),
    );
  });
});
